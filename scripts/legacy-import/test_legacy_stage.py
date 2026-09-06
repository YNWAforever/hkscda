import unittest
from legacy_stage import parse_inserts, stage, money_cents
import sqlite3

class ImportTests(unittest.TestCase):
    def test_quotes_and_embedded_sql_are_data(self):
        text = "INSERT INTO `animals` (`id`,`name`) VALUES (1,'O\\\'Brien; DROP TABLE users;'),(2,'貓, (kitten)');"
        rows = list(parse_inserts(text))
        self.assertEqual(rows[0][2], [['1', "O'Brien; DROP TABLE users;"], ['2', '貓, (kitten)']])
    def test_only_literals_allowed(self):
        with self.assertRaises(ValueError):
            list(parse_inserts('INSERT INTO `animals` (`id`) VALUES (sleep(2));'))
    def test_incomplete_statement_rejected(self):
        with self.assertRaises(ValueError):
            list(parse_inserts("INSERT INTO `animals` (`id`) VALUES ('broken"))
    def test_staging_excludes_credentials_and_is_repeatable(self):
        db=sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        sql="INSERT INTO `users` (`id`,`password`) VALUES (1,'secret'); INSERT INTO `animals` (`id`,`name`) VALUES (1,'貓');"
        inventory={'animals':['id','name'], 'users':['id','password']}
        first=stage(db,sql,inventory)
        second=stage(db,sql,inventory)
        self.assertEqual(first['inserted'],1)
        self.assertEqual(second['inserted'],0)
        self.assertEqual(db.execute('select count(*) from legacy_rows').fetchone()[0],1)
        self.assertNotIn('secret',repr(db.execute('select * from legacy_rows').fetchall()))
    def test_conflict_rolls_back_whole_batch(self):
        db=sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        inv={'animals':['id','name']}
        stage(db,"INSERT INTO `animals` (`id`,`name`) VALUES (1,'old');",inv)
        with self.assertRaises(ValueError):
            stage(db,"INSERT INTO `animals` (`id`,`name`) VALUES (2,'new'),(1,'changed');",inv)
        self.assertEqual(db.execute('select count(*) from legacy_rows').fetchone()[0],1)
    def test_money_is_exact(self):
        self.assertEqual(money_cents('10.10'),1010)
        for bad in ['1.005','NaN','21474836.48','-1']:
            with self.assertRaises(ValueError): money_cents(bad)


class SafetyBoundaryTests(unittest.TestCase):
    def test_unsupported_quote_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            list(parse_inserts("SET SQL_MODE = 'NO_BACKSLASH_ESCAPES'; INSERT INTO `animals` (`id`) VALUES (1);"))
    def test_staging_path_is_bound_to_repository(self):
        from legacy_stage import checked_database_path
        from pathlib import Path
        with self.assertRaises(ValueError): checked_database_path(Path('C:/unrelated/backups/data.sqlite'))
    def test_database_is_bound_to_source(self):
        from legacy_stage import bind_source
        db=sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        bind_source(db,'first')
        bind_source(db,'first')
        with self.assertRaises(ValueError): bind_source(db,'second')

class MorePrivacyTests(unittest.TestCase):
    def test_file_access_tokens_are_removed(self):
        db=sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        stage(db,"INSERT INTO `files` (`id`,`token`,`path`) VALUES (1,'sensitive','photo.jpg');",{'files':['id','token','path']})
        self.assertNotIn('sensitive',repr(db.execute('select * from legacy_rows').fetchall()))
    def test_malformed_later_statement_rolls_back(self):
        db=sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        with self.assertRaises(ValueError):
            stage(db,"INSERT INTO `animals` (`id`) VALUES (1); DROP TABLE users;",{'animals':['id']})
        self.assertEqual(db.execute('select count(*) from legacy_rows').fetchone()[0],0)

class ExecutableCommentTests(unittest.TestCase):
    def test_quote_mode_in_executable_comment_is_rejected(self):
        with self.assertRaises(ValueError):
            list(parse_inserts("/*!40101 SET SQL_MODE='NO_BACKSLASH_ESCAPES' */; INSERT INTO `animals` (`id`) VALUES (1);"))

class MariaCommentTests(unittest.TestCase):
    def test_mariadb_quote_mode_comment_is_rejected(self):
        with self.assertRaises(ValueError):
            list(parse_inserts("/*M!100100 SET SQL_MODE='NO_BACKSLASH_ESCAPES' */; INSERT INTO `animals` (`id`) VALUES (1);"))

if __name__=='__main__': unittest.main()
