CREATE DATABASE IF NOT EXISTS sustainable_market
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sustainable_market;

DROP TABLE IF EXISTS sepet_urunleri;
DROP TABLE IF EXISTS urunler;
DROP TABLE IF EXISTS email_dogrulamalari;
DROP TABLE IF EXISTS kullanicilar;

CREATE TABLE kullanicilar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  sifre_hash VARCHAR(255) NOT NULL,
  rol ENUM('market', 'musteri') NOT NULL,
  ad VARCHAR(120) NOT NULL,
  sehir VARCHAR(80) NOT NULL,
  ilce VARCHAR(80) NOT NULL,
  dogrulandi_mi TINYINT(1) NOT NULL DEFAULT 0,
  olusturma_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  guncelleme_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE email_dogrulamalari (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kullanici_id INT NOT NULL,
  kod VARCHAR(6) NOT NULL,
  son_tarih DATETIME NOT NULL,
  kullanildi_mi TINYINT(1) NOT NULL DEFAULT 0,
  olusturma_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE TABLE urunler (
  id INT AUTO_INCREMENT PRIMARY KEY,
  market_id INT NOT NULL,
  baslik VARCHAR(150) NOT NULL,
  stok INT NOT NULL,
  normal_fiyat DECIMAL(10,2) NOT NULL,
  indirimli_fiyat DECIMAL(10,2) NOT NULL,
  son_kullanma_tarihi DATE NOT NULL,
  resim_yolu VARCHAR(255) NOT NULL DEFAULT '/uploads/default-product.svg',
  olusturma_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  guncelleme_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (market_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE TABLE sepet_urunleri (
  id INT AUTO_INCREMENT PRIMARY KEY,
  musteri_id INT NOT NULL,
  urun_id INT NOT NULL,
  adet INT NOT NULL DEFAULT 1,
  olusturma_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  guncelleme_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (musteri_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
  FOREIGN KEY (urun_id) REFERENCES urunler(id) ON DELETE CASCADE,
  UNIQUE KEY tek_musteri_urun (musteri_id, urun_id)
);
