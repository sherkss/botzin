-- botzin database and botzin user are created by docker-compose env vars
-- (MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD). Only botzin_test needs
-- manual setup here.

CREATE DATABASE IF NOT EXISTS botzin_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON botzin_test.* TO 'botzin'@'%';
FLUSH PRIVILEGES;
