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

const errorPlans = {};
for (const filesystem of Object.keys(plans)) {
  const errors = plans[filesystem].filter(action => action.error);
  if (errors.length > 0) {
    errorPlans[filesystem] = errors;
  }
}

if (Object.keys(errorPlans).length > 0) {
  for (const filesystem of Object.keys(errorPlans)) {
    const errors = errorPlans[filesystem];
    for (const error of errors) {
      console.log(filesystem, error.error);
    }
  }
  console.log('There were errors, aborting!');
  process.exit(1);
}

// unmount backup filesystems
// it needs to unmount to do zfs recv, but they need to be done in a particular order that if we leave it to zfs recv to do the unmounting it won't work...

log.info('unmount backup filesystems');

getMountpoints(Object.keys(sourceFilesystems))
  .filter(hasMountpoint)
  // longest first, so nested ones are unmount before parent ones, otherwise we get "target is busy" error
  .sort((a, b) => b.mountpoint.length - a.mountpoint.length)
  .forEach(({ filesystem, mountpoint }) => {
    let backupFilesystem = backupFilesystemFor(destination, filesystem);
    execSync(`zfs unmount -f ${backupFilesystem}`);
  });

executePlans(plans).then(() => {

  log.info('setting backup mountpoints');

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

function hasMountpoint({ mountpoint }) {
  return Boolean(mountpoint)
}

