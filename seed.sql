USE sustainable_market;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE sepet_urunleri;
TRUNCATE TABLE urunler;
TRUNCATE TABLE email_dogrulamalari;
TRUNCATE TABLE kullanicilar;
SET FOREIGN_KEY_CHECKS = 1;

-- Tum demo kullanicilarin sifresi: 1234
-- Bcrypt hash: 1234
INSERT INTO kullanicilar (id, email, sifre_hash, rol, ad, sehir, ilce, dogrulandi_mi) VALUES
(1, 'tokmarket@example.com', '$2b$10$JR5fFlMagZnWNc/WNhNpiOOZZOtETZwFbHOkMEg7.zrlmLU8vXEzy', 'market', 'Tok Market', 'Ankara', 'Bilkent', 1),
(2, 'yesilmarket@example.com', '$2b$10$JR5fFlMagZnWNc/WNhNpiOOZZOtETZwFbHOkMEg7.zrlmLU8vXEzy', 'market', 'Yesil Market', 'Ankara', 'Cankaya', 1),
(3, 'egepazar@example.com', '$2b$10$JR5fFlMagZnWNc/WNhNpiOOZZOtETZwFbHOkMEg7.zrlmLU8vXEzy', 'market', 'Ege Pazar', 'Izmir', 'Bornova', 1),
(4, 'ayse@example.com', '$2b$10$JR5fFlMagZnWNc/WNhNpiOOZZOtETZwFbHOkMEg7.zrlmLU8vXEzy', 'musteri', 'Ayse Yilmaz', 'Ankara', 'Bilkent', 1),
(5, 'mehmet@example.com', '$2b$10$JR5fFlMagZnWNc/WNhNpiOOZZOtETZwFbHOkMEg7.zrlmLU8vXEzy', 'musteri', 'Mehmet Demir', 'Ankara', 'Cankaya', 1),
(6, 'elif@example.com', '$2b$10$JR5fFlMagZnWNc/WNhNpiOOZZOtETZwFbHOkMEg7.zrlmLU8vXEzy', 'musteri', 'Elif Kaya', 'Izmir', 'Bornova', 1);

INSERT INTO urunler (market_id, baslik, stok, normal_fiyat, indirimli_fiyat, son_kullanma_tarihi, resim_yolu) VALUES
(1, 'Toblerone 100gr', 25, 200.00, 120.00, '2026-05-22', '/uploads/default-product.svg'),
(1, 'Magnum Classic', 40, 55.00, 35.00, '2026-05-12', '/uploads/default-product.svg'),
(1, 'Gunluk Sut 1L', 18, 42.00, 25.00, '2026-05-09', '/uploads/default-product.svg'),
(1, 'Organik Yumurta 10lu', 12, 110.00, 75.00, '2026-05-14', '/uploads/default-product.svg'),
(1, 'Eski Tarihli Yogurt 500gr', 8, 36.00, 18.00, '2026-04-20', '/uploads/default-product.svg'),

(2, 'Magnolia Cake', 9, 95.00, 60.00, '2026-05-11', '/uploads/default-product.svg'),
(2, 'Nutmeg Baharat', 14, 80.00, 48.00, '2026-06-01', '/uploads/default-product.svg'),
(2, 'Hindi Salam 150gr', 16, 72.00, 45.00, '2026-05-10', '/uploads/default-product.svg'),
(2, 'Meyveli Kefir', 20, 38.00, 22.00, '2026-05-13', '/uploads/default-product.svg'),
(2, 'Tarihi Gecmis Peynir', 5, 160.00, 60.00, '2026-04-15', '/uploads/default-product.svg'),

(3, 'Izmir Tulum Peyniri', 11, 190.00, 125.00, '2026-05-18', '/uploads/default-product.svg'),
(3, 'Zeytin Ezmesi', 22, 85.00, 55.00, '2026-06-05', '/uploads/default-product.svg'),
(3, 'Cilekli Yogurt', 15, 34.00, 19.00, '2026-05-10', '/uploads/default-product.svg'),
(3, 'Hazir Sandvic', 13, 65.00, 39.00, '2026-05-08', '/uploads/default-product.svg'),
(3, 'Gecmis Tarihli Krem Peynir', 6, 75.00, 25.00, '2026-04-22', '/uploads/default-product.svg');

INSERT INTO sepet_urunleri (musteri_id, urun_id, adet) VALUES
(4, 1, 1),
(4, 2, 2),
(5, 6, 1),
(6, 11, 1);
