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
