"""Validate, merge, export, back up and restore DataForge's local database."""
import argparse
import json
import os
import socket
import sqlite3
import time
from contextlib import closing
from pathlib import Path
import server


def assert_stopped():
    marker = server.DATA / 'runtime.json'
    if marker.exists():
        record = json.loads(marker.read_text(encoding='utf-8'))
        with socket.socket() as sock:
            sock.settimeout(1)
            if sock.connect_ex(('127.0.0.1', record['port'])) == 0:
                raise ValueError('Stop the DataForge server before restoring a backup.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['validate', 'import', 'export', 'backup', 'restore'])
    parser.add_argument('path', type=Path)
    parser.add_argument('--apply', action='store_true', help='Commit an import after validation')
    args = parser.parse_args()
    try:
        if args.command == 'validate':
            bank = server.validate_bank(json.loads(args.path.read_text(encoding='utf-8-sig')))
            print(f"Valid: {len(bank['questions'])} questions in {len(bank['chapters'])} chapters.")
            return
        if args.command == 'restore':
            assert_stopped()
            source = args.path.resolve(strict=True)
            if source == server.DB.resolve():
                raise ValueError('Choose a separate backup file.')
            with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as backup:
                if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('Backup failed SQLite integrity check.')
                tables = {r[0] for r in backup.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not {'meta', 'chapters', 'questions', 'attempts', 'progress', 'bookmarks', 'choice_orders', 'imports'} <= tables:
                    raise ValueError('This is not a complete DataForge backup.')
                server.DATA.mkdir(parents=True, exist_ok=True)
                previous = server.DATA / ('before-restore-' + str(time.time_ns()) + '.sqlite3')
                if server.DB.exists():
                    with closing(sqlite3.connect(server.DB)) as old, closing(sqlite3.connect(previous)) as saved:
                        old.backup(saved)
                    print('Previous database saved at:', previous)
                # SQLite backup atomically replaces the database contents, including indexes.
                with closing(sqlite3.connect(server.DB)) as destination:
                    backup.backup(destination)
            print('Restore complete. Start DataForge to use the restored database.')
            return
        server.initialize()
        if args.command == 'import':
            summary = server.import_bank(json.loads(args.path.read_text(encoding='utf-8-sig')), commit=args.apply)
            print(json.dumps(summary, indent=2))
            if not args.apply:
                print('Preview only. Add --apply to merge these changes.')
        elif args.command == 'export':
            with server.connect() as c:
                bank = dict(schema_version=1, bank_version=c.execute("SELECT value FROM meta WHERE key='bank_version'").fetchone()[0],
                            chapters=server.chapters(c), questions=server.questions(c))
            args.path.write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding='utf-8')
            print('Question bank exported to:', args.path)
        elif args.command == 'backup':
            if args.path.resolve() == server.DB.resolve():
                raise ValueError('Choose a different backup destination.')
            with server.connect() as source, closing(sqlite3.connect(args.path)) as dest:
                source.backup(dest)
            print('Full backup saved to:', args.path)
    except (ValueError, OSError, sqlite3.Error) as exc:
        parser.exit(1, str(exc) + '\n')


if __name__ == '__main__':
    main()
