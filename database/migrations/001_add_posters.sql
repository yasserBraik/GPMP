-- Adds the project posters table to an EXISTING GPMP database without touching other data.
-- Only needed if you set up GPMP before the Posters page existed and want to keep your data.
-- (A fresh "npm run db:setup" already creates this table.)
--
-- XAMPP / Git Bash, from the GPMP folder (MySQL must be running):
--   /c/xampp/mysql/bin/mysql.exe -u root gpmp < database/migrations/001_add_posters.sql

CREATE TABLE IF NOT EXISTS poster (
  PosterID         INT AUTO_INCREMENT PRIMARY KEY,
  GroupID          INT NOT NULL UNIQUE,           -- one poster per group (a new upload replaces it)
  Title            VARCHAR(200) NOT NULL,
  Summary          TEXT NULL,                     -- short description shown under the poster
  FileName         VARCHAR(255) NOT NULL,         -- original file name
  FilePath         VARCHAR(500) NOT NULL,         -- stored file name inside uploads/
  MimeType         VARCHAR(100) NOT NULL,
  FileSize         INT NOT NULL,
  ImageWidth       INT NULL,
  ImageHeight      INT NULL,
  UploadedByUserID INT NULL,
  CreatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_poster_group FOREIGN KEY (GroupID)          REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT fk_poster_user  FOREIGN KEY (UploadedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
