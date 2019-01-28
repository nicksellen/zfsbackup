const pify = require('pify');
const { exec, execSync } = require('child_process');
const { join } = require('path');
const log = require('./log');
const leftPad = require('left-pad'); // indispensable ;)

let IGNORE_MOUNTPOINTS = ['-', 'none', 'legacy'];

function listSnapshots(roots) {
  return execSync(
    `zfs list -H -r -t snapshot -o name ${roots.join(' ')}`,
    { encoding: 'utf8' }
  ).trim().split('\n').map(line => {
    let [filesystem, snapshot] = line.split('@');
    return { filesystem, snapshot };
  });
}

function getMountpoints(filesystems) {
  return execSync(
    `zfs list -H -o name,mountpoint ${filesystems.join(' ')}`,
    { encoding: 'utf8' }
  ).trim().split('\n').map(line => {
    let [filesystem, mountpoint] = line.split('\t');
    if (IGNORE_MOUNTPOINTS.includes(mountpoint)) {
      mountpoint = null;
    }
    return { filesystem, mountpoint };
  });
}

function groupByFilesystem(snapshots) {
  return snapshots.reduce((m, { filesystem, snapshot }) => {
    if (!m[filesystem]) {
      m[filesystem] = [];
    }
    m[filesystem].push(snapshot);
    return m;
  }, {});
}

function makeFilesystemPlans(filesystem, sourceSnapshots, backupFilesystem, backupSnapshots) {
  let plans = [];
  if (sourceSnapshots.length === 0) {
    return;
  }
  if (backupSnapshots) {
    if (backupSnapshots.length > 0) {
      let lastBackupSnapshot = backupSnapshots[backupSnapshots.length - 1];
      let idx = sourceSnapshots.indexOf(lastBackupSnapshot);
      if (idx !== -1) {
        if (sourceSnapshots.length - 1 > idx) {
          let lastSourceSnapshot = sourceSnapshots[sourceSnapshots.length - 1];
          plans.push({
            message: `sending incrementals from ${lastBackupSnapshot} to ${lastSourceSnapshot}`,
            command: `zfs send -i ${filesystem}@${lastBackupSnapshot} ${filesystem}@${lastSourceSnapshot} | zfs recv -F ${backupFilesystem}`
          });
        } else {
          plans.push({ status: 'all up to date!' });
        }
      } else {
        plans.push({ error: `last backup snapshot [${lastBackupSnapshot}] is not on source :(` });
      }
    } else {
      plans.push({ error: 'no backup snapshots :(' });
    }
  } else {
    plans.push({
      message: `create backup filesystem [${backupFilesystem}]`,
      ensureFilesystemExists: backupFilesystem
    });
    let firstSourceSnapshot = sourceSnapshots[0];
    plans.push({
      message: `send initial snapshot ${firstSourceSnapshot}`,
      command: `zfs send ${filesystem}@${firstSourceSnapshot} | zfs recv -F ${backupFilesystem}`
    });
    if (sourceSnapshots.length > 1) {
      let lastSourceSnapshot = sourceSnapshots[sourceSnapshots.length - 1];
      plans.push({
        message: `send incrementals from ${firstSourceSnapshot} to ${lastSourceSnapshot}`,
        command: `zfs send -i ${filesystem}@${firstSourceSnapshot} ${filesystem}@${lastSourceSnapshot} | zfs recv -F ${backupFilesystem}`
      });
    }
  }
  return plans;
}

function makePlans(sourceFilesystems, backupFilesystems, destination) {
  let plans = {};
  let filesystems = Object.keys(sourceFilesystems);
  filesystems.forEach(filesystem => {
    let backupFilesystem = backupFilesystemFor(destination, filesystem);
    plans[filesystem] = makeFilesystemPlans(
      filesystem,
      sourceFilesystems[filesystem],
      backupFilesystem,
      backupFilesystems[backupFilesystem]
    );
  });
  return plans;
}

function backupFilesystemFor(destination, filesystem) {
  // remove the first part
  const [_, ...rest] = filesystem.split('/')
  return join(destination, ...rest)
}

function executePlans(plans) {

  let ensureFilesystems = [];
  Object.keys(plans).forEach(filesystem => {
    plans[filesystem].forEach(plan => {
      if (plan.ensureFilesystemExists) {
        ensureFilesystems.push(plan.ensureFilesystemExists);
      }
    });
  });

  if (ensureFilesystems.length > 0) {
    ensureFilesystems.forEach(filesystem => {
      execSync(`zfs create -p ${filesystem}`, { encoding: 'utf8' });
    });
  }

  return Promise.all(Object.keys(plans).map(filesystem => {
    let filesystemPlans = plans[filesystem].filter(plan => plan.command);
    return pify(execute)(filesystem, filesystemPlans, 0);
  }));

}

function execute(filesystem, plans, idx, callback) {
  let plan = plans[idx];
  if (!plan) return callback();
  let id = nextTaskId();
  log.info(
    `${id} ${filesystem}: ${plan.message}`
  );
  pify(exec)(plan.command).then(() => {
    log.info(`${id} done`);
    execute(filesystem, plans, idx + 1, callback);
  }).catch(err => {
    callback(err);
  });
}

let _taskId = 1;
function nextTaskId() {
  return 'TASK' + leftPad(_taskId++, 3, 0);
}

function check(pass, message) {
  if (!pass) {
    log.info(message);
    process.exit(1);
  }
}

module.exports = {
  check,
  groupByFilesystem,
  listSnapshots,
  getMountpoints,
  makePlans,
  executePlans,
  backupFilesystemFor
};
