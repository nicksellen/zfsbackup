# zfsbackup

Another zfs backup tool. I made it just for my needs, which are:

* backing up zfs filesystems on my local drives, to a USB connected zfs disk
* all snapshots that match filter to be sent
* not 100% perfect, I can hack it if I missed a case
* concurrency+parallelism on a filesystem level
* not responsible for creating snapshots
* incremental sends
* runs in a modern nodejs with es2015 support
* configurable with a toml file

My config is:

```toml
sources = ['zroot', 'zdata']
destination = 'zruby/backup'

includes = ['**']
excludes = ['zroot/ROOT/*']
```

Matches are done with glob matching (via [minimatch](https://github.com/isaacs/minimatch)).

It probably has some bugs. They may be serious. Use at your own risk.

## Installation and Use

I didn't publish it to npm, but you can install directly from github:

```
sudo npm install -g 'https://github.com/nicksellen/zfsbackup.git#v0.0.4'
```

And then run it:
```
zfsbackup path/to/config.toml
```

## Changelog

### 0.0.5

* breaking change! don't include first part of source filesystem in backup path
    * with _source_ as **zroot** and _dest_ as **zbackup/backup**:
        * _before change_: **zroot/foo/bar** backed up to **zbackup/backup/zroot/foo/bar**
        * _after change_: **zroot/foo/bar** backed up to **zbackup/backup/foo/bar**

### 0.0.4

* always use `-F` with `zfs recv`

### 0.0.3

* if source filesystme is mounted at / map it to /ROOT for the backup filesystem
  (to prevent it trying to mount / in a non-empty directoy)

### 0.0.2

* set backup filesystem mountpoints based on source filesystem names + destination prefix

### 0.0.1

* initial release
