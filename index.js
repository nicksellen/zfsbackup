#!/usr/bin/env node

const minimatch = require('minimatch');
const toml = require('toml');

const { readFileSync } = require('fs');
const { execSync } = require('child_process');

const log = require('./log');

const {
  check,
  groupByFilesystem,
  listSnapshots,
  getMountpoints,
  makePlans,
  executePlans,
  backupFilesystemFor
} = require('./zfsbackup');

const configPath = process.argv[2];
if (!configPath) {
  console.log(`Usage: ${process.argv[1]} path/to/config.toml`);
  process.exit(1);
}
const config = toml.parse(readFileSync(configPath, 'utf8'));

let {
  sources = [],
  destination,
  includes = ['**'],
  excludes = []
} = config;

check(sources.length > 0, 'please specify one or more sources');
check(destination, 'please specify a destination');

let sourceFilesystems = groupByFilesystem(listSnapshots(sources)
  .filter(({ filesystem }) => {
    return includes.find(pattern => {
      return minimatch(filesystem, pattern);
    });
  })
  .filter(({ filesystem }) => {
    return !excludes.find(pattern => {
      return minimatch(filesystem, pattern);
    });
  }));

let backupFilesystems = groupByFilesystem(listSnapshots([destination]));

let plans = makePlans(sourceFilesystems, backupFilesystems, destination);

executePlans(plans).then(() => {

  log.info('setting backup mountpoints');

  function hasMountpoint({ mountpoint }) {
    return Boolean(mountpoint)
  }

  const backupMountpoints = {}

  const altroots = {}
  function getAltroot(filesystem) {
    const zpool = filesystem.split('/')[0]
    let altroot = altroots[zpool]
    if (altroot) return altroot
    altroot = execSync(`zpool get altroot -H -o value ${zpool}`, { encoding: 'utf8' }).trim()
    if (altroot === '-') altroot = ''
    altroots[zpool] = altroot
    return altroot
  }

  getMountpoints(Object.keys(backupFilesystems))
    .filter(hasMountpoint)
    .forEach(({ filesystem, mountpoint }) => {
      const altroot = getAltroot(filesystem)
      mountpoint = mountpoint.substring(altroot.length)
      if (mountpoint === '') mountpoint = '/'
      backupMountpoints[filesystem] = mountpoint
    })

  getMountpoints(Object.keys(sourceFilesystems))
    .filter(hasMountpoint)
    .forEach(({ filesystem, mountpoint }) => {
      // we assume they are importing the backup zpool with -R /somewhere so the mountpoints don't conflict
      let backupFilesystem = backupFilesystemFor(destination, filesystem);
      if (backupMountpoints[backupFilesystem] !== mountpoint) {
        execSync(`zfs set mountpoint=${mountpoint} ${backupFilesystem}`);
      }
    });

  log.info('all complete!');
}).catch(err => {
  log.error(err);
});
