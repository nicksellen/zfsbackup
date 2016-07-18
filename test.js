const test = require('tape');

const {
  groupByFilesystem,
  makePlans,
  executePlans
} = require('./zfsbackup');

test('groupByFilesystem', t => {
  t.plan(3);
  let m = groupByFilesystem([
    { filesystem: 'a', snapshot: 'a1' },
    { filesystem: 'a', snapshot: 'a2' },
    { filesystem: 'b', snapshot: 'b1' },
  ]);
  t.equal(Object.keys(m).length, 2, 'should have two filesystems');
  t.equal(m.a.length, 2, 'should have two a snapshots');
  t.equal(m.b.length, 1, 'should have one b snapshot');
});

test('makePlans can create initial filesystems', t => {
  t.plan(4);
  let plans = makePlans(

    // source filesystems
    {
      a: ['a1']
    },

    // backup filesystems
    {},

    // destination prefix
    'my/backup'

  );
  t.assert(plans.a, 'should create plans for a');
  t.equal(plans.a.length, 2, 'should be one plan')
  t.equal(plans.a[0].message,
    'create backup filesystem [my/backup/a]', 'should have correct message');
  t.equal(plans.a[0].ensureFilesystemExists,
    'my/backup/a', 'should set ensureFilesystemExists plan option');
});

test('makePlans will report errors if there are no common snapshots', t => {
  t.plan(3);
  let plans = makePlans(

    // source filesystems
    {
      a: ['a3', 'a4']
    },

    // backup filesystems
    {
      'my/backup/a': ['a1', 'a2']
    },

    // destination prefix
    'my/backup'

  );
  t.assert(plans.a, 'should create plans for a');
  t.equal(plans.a.length, 1, 'should be one plan')
  t.equal(plans.a[0].error,
    'last backup snapshot [a2] is not on source :(', 'should have correct message');
});




test('makePlans can report everything is up to date', t => {
  t.plan(3);
  let plans = makePlans(

    // source filesystems
    {
      a: ['a1', 'a2']
    },

    // backup filesystems
    {
      'my/backup/a': ['a1', 'a2']
    },

    // destination prefix
    'my/backup'

  );
  t.assert(plans.a, 'should create plans for a');
  t.equal(plans.a.length, 1, 'should be one plan')
  t.equal(plans.a[0].status,
    'all up to date!', 'should have correct message');
});

test('makePlans can send incrementals', t => {
  t.plan(4);
  let plans = makePlans(

    // source filesystems
    {
      a: ['a2', 'a3']
    },

    // backup filesystems
    {
      'my/backup/a': ['a1', 'a2']
    },

    // destination prefix
    'my/backup'

  );
  t.assert(plans.a, 'should create plans for a');
  t.equal(plans.a.length, 1, 'should be one plan')
  t.equal(plans.a[0].message,
    'sending incrementals from a2 to a3', 'should have correct message');
  t.equal(plans.a[0].command,
    'zfs send -i a@a2 a@a3 | zfs recv -F my/backup/a', 'should have correct command');
});
