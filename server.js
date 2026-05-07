require('dotenv').config();

const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const PORT = 3000;

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'sustainable_market',
  waitForConnections: true,
  connectionLimit: 10
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'basit_session_secret',
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.kullanici = req.session.kullanici || null;
  res.locals.mesajHata = req.session.mesajHata || null;
  res.locals.mesajBasari = req.session.mesajBasari || null;
  delete req.session.mesajHata;
  delete req.session.mesajBasari;
  next();
});

function bosMu(deger) {
  return !deger || String(deger).trim() === ''; //GENEL KULLANMAK İÇİN BOŞ MU DEĞİL Mİ?
}

app.use((req, res, next) => { //GLOBAL MIDDLEWARE
  res.locals.kullanici = req.session.kullanici || null;
  res.locals.mesajHata = req.session.mesajHata || null;
  res.locals.mesajBasari = req.session.mesajBasari || null;
  res.locals.paraYaz = (deger) => Number(deger || 0).toFixed(2);
  res.locals.tarihYaz = (tarih) => {
    if (!tarih) return '';
    return new Date(tarih).toISOString().slice(0, 10);
  };
  delete req.session.mesajHata;
  delete req.session.mesajBasari;
  next();
});


function emailDogruMu(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function dogrulamaKoduOlustur() {
  return String(Math.floor(100000 + Math.random() * 900000)); //RASTGELE DOĞRULAMA KODU OLUŞTURMAK İÇİN -> HER ZAMAN 6 HANE
}

function girisGerekli(req, res, next) {
  if (!req.session.kullanici) {
    req.session.mesajHata = 'Bu sayfaya girmek için önce giriş yapmalısınız.';
    return res.redirect('/giris');
  }
  next();
}

async function mailKoduGonder(email, kod) {
  if (process.env.EMAIL_DEV_MODE === 'true') {
    console.log('----------------------------------------');
    console.log('Email dev mode aktif. Gercek email gonderilmedi.');
    console.log(`Dogrulama kodu (${email}): ${kod}`);
    console.log('----------------------------------------');
    return;
  }

  const transporter = nodemailer.createTransport({ //EMAIL'E KOD GÖNDERMEK İÇİN HAZIR FONKSİYON
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Sustainable Discount Marketplace Dogrulama Kodu',
    text: `Dogrulama kodunuz: ${kod}. Bu kod 10 dakika icinde gecerlidir.`
  });
}

async function yeniDogrulamaKoduKaydet(kullaniciId, email) {
  const kod = dogrulamaKoduOlustur();
  await db.query(
    'INSERT INTO email_dogrulamalari (kullanici_id, kod, son_tarih) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
    [kullaniciId, kod]
  );
  await mailKoduGonder(email, kod);
}

function kayitHatalariGetir(bilgi, kayitTipi) { //GENEL HATA İÇİN HEM MARKET HEM DE KULLANICI UYUMLU
  const hatalar = [];
  if (!emailDogruMu(bilgi.email)) hatalar.push('Geçerli bir email yazmalısınız.');
  if (bosMu(bilgi.ad)) {
    hatalar.push(kayitTipi === 'market' ? 'Market adı boş olamaz.' : 'Ad soyad boş olamaz.'); //MARKET KAYIT YERİYSE MARKET YOKSA AD BOŞ OLAMAZ DÖNDÜRÜR.
  }
  if (bosMu(bilgi.sifre) || String(bilgi.sifre).length < 4) hatalar.push('Şifre en az 4 karakter olmalidir.'); //ŞİFRE UZUNLUGU BAKIYORUZ.
  if (bosMu(bilgi.sehir)) hatalar.push('Sehir boş olamaz.');
  if (bosMu(bilgi.ilce)) hatalar.push('İlçe boş olamaz.');
  return hatalar; //BURADAN LENGTH ALACAGIZ.
}


function urunHatalariGetir(bilgi) { //BURADAN LENGTH ALACAGIZ.
  const hatalar = [];
  const stok = Number(bilgi.stok);
  const normalFiyat = Number(bilgi.normalFiyat);
  const indirimliFiyat = Number(bilgi.indirimliFiyat);

  if (bosMu(bilgi.baslik)) hatalar.push('Ürün başlığı boş olamaz.');
  if (!Number.isInteger(stok) || stok < 1) hatalar.push('Stok pozitif bir tam sayı olmalıdır.');
  if (isNaN(normalFiyat) || normalFiyat <= 0) hatalar.push('Fiyat pozitif olmalidir.');
  if (isNaN(indirimliFiyat) || indirimliFiyat <= 0) hatalar.push('Fiyat pozitif olmalıdır.');
  if (!isNaN(normalFiyat) && !isNaN(indirimliFiyat) && indirimliFiyat >= normalFiyat) {
    hatalar.push('İndirimli fiyat normal fiyattan düşük olmalıdır.');
  }
  if (bosMu(bilgi.sonKullanmaTarihi)) hatalar.push('Son kullanma tarihi seçilmelidir.');
  return hatalar;
}

async function sepetToplamiGetir(musteriId) {
  const [satirlar] = await db.query(
    `SELECT COALESCE(SUM(s.adet * u.indirimli_fiyat), 0) AS genel_toplam
     FROM sepet_urunleri s
     JOIN urunler u ON u.id = s.urun_id
     WHERE s.musteri_id = ?`,
    [musteriId]
  );
  return Number(satirlar[0].genel_toplam || 0);
}


app.get('/', (req, res) => { //ANA SAYFAMIZ
  res.render('index');
});

//MARKET KAYIT BÖLÜMÜ BASLANGIC

app.get('/market-kayit', (req, res) => { //MARKET KAYIT KISMIMIZ
  res.render('market-kayit', { hatalar: [], eskiBilgi: {} }); //HATALAR VE EKSİK BİLGİ GÖNDERİYORUZ --> BOŞ GELİCEK ZATEN İLK AÇILIŞ İÇİN
});

app.post('/market-kayit', async (req, res, next) => { //BURADA STICKY FORM VE HATALAR
  try {
    const eskiBilgi = {
      email: req.body.email,
      ad: req.body.ad,
      sehir: req.body.sehir,
      ilce: req.body.ilce
    };
    const hatalar = kayitHatalariGetir(req.body, 'market');

    if (hatalar.length > 0) {
      return res.render('market-kayit', { hatalar, eskiBilgi }); //HATA VARSA BURASI
    }

    const [varOlanlar] = await db.query('SELECT id FROM kullanicilar WHERE email = ?', [req.body.email]); //BURADA MAİL-DUPLICATION BAKCAZ
    if (varOlanlar.length > 0) {
      return res.render('market-kayit', { hatalar: ['Bu email zaten kullaniliyor.'], eskiBilgi }); //VARSA HATALARA EKLEDİM.
    }

    const sifreHash = await bcrypt.hash(req.body.sifre, 10); //BURASI BCRYPT'TEN GELİYOR !!!ŞİFRE HASHLIYOR!!!
    const [sonuc] = await db.query(
      `INSERT INTO kullanicilar (email, sifre_hash, rol, ad, sehir, ilce, dogrulandi_mi)
       VALUES (?, ?, 'market', ?, ?, ?, 0)`,
      [req.body.email.trim(), sifreHash, req.body.ad.trim(), req.body.sehir.trim(), req.body.ilce.trim()] //MAIL, SIFRE, AD, SEHIR, ILCE GÖNDERDİK.
    );

    await yeniDogrulamaKoduKaydet(sonuc.insertId, req.body.email.trim()); //BURADAN INP ALIYORUZ.
    req.session.mesajBasari = 'Kayit basarili. Email dogrulama kodunuzu girin.';
    res.redirect('/email-dogrula?email=' + encodeURIComponent(req.body.email.trim()));
  } catch (hata) {
    next(hata);
  }
});

//-------------- MUSTERI KAYIT ----------------//
app.get('/musteri-kayit', (req, res) => { //MUSTERİ KAYITI İÇİN
  res.render('musteri-kayit', { hatalar: [], eskiBilgi: {} }); //YINE BOS GÖNDERDİK
});

app.post('/musteri-kayit', async (req, res, next) => { //SUBMIT EDİLİNCE
  try {
    const eskiBilgi = {
      email: req.body.email,
      ad: req.body.ad,
      sehir: req.body.sehir,
      ilce: req.body.ilce
    }; //STICKY FORM İÇİN
    const hatalar = kayitHatalariGetir(req.body, 'musteri');

    if (hatalar.length > 0) {
      return res.render('musteri-kayit', { hatalar, eskiBilgi }); //HATA VARSA BURASI CALISCAK
    }

    const [varOlanlar] = await db.query('SELECT id FROM kullanicilar WHERE email = ?', [req.body.email]); //BU SEFER MUSTERI ICIN EMAIL DUPLICATE CHECK YAPTIm.
    if (varOlanlar.length > 0) {
      return res.render('musteri-kayit', { hatalar: ['Bu email zaten kullaniliyor.'], eskiBilgi }); //HATA VARSA BURASI CALISCAK
    }

    const sifreHash = await bcrypt.hash(req.body.sifre, 10); //BURASI HASHLEME YAPIYOR TAM BİLMİYORUM???
    const [sonuc] = await db.query(
      `INSERT INTO kullanicilar (email, sifre_hash, rol, ad, sehir, ilce, dogrulandi_mi)
       VALUES (?, ?, 'musteri', ?, ?, ?, 0)`,
      [req.body.email.trim(), sifreHash, req.body.ad.trim(), req.body.sehir.trim(), req.body.ilce.trim()]
    ); //HATA YOKSA SQL'E KAYDET

    await yeniDogrulamaKoduKaydet(sonuc.insertId, req.body.email.trim()); //SQL'E KODLARI KAYDEDİYORUZ
    req.session.mesajBasari = 'Kayit basarili. Email dogrulama kodunuzu girin.';
    res.redirect('/email-dogrula?email=' + encodeURIComponent(req.body.email.trim())); //BURADA EMAIL=EXAMPLE@GMAIL.COM GİBİ URL CIKICAK, URL'DEN BAKIP KODU KONTROL EDECEĞİZ.
  } catch (hata) {
    next(hata);
  }
});

app.get('/email-dogrula', (req, res) => {
  res.render('email-dogrula', { hatalar: [], eskiBilgi: { email: req.query.email || '' } }); //BOS BILGI
});

app.post('/email-dogrula', async (req, res, next) => { //BURADA KOD CHECK 
  try {
    const email = (req.body.email || '').trim();
    const kod = (req.body.kod || '').trim();
    const eskiBilgi = { email };
    const hatalar = [];

    if (!emailDogruMu(email)) hatalar.push('Gecerli email yazmalisiniz.');
    if (!/^\d{6}$/.test(kod)) hatalar.push('Kod 6 haneli sayi olmalidir.'); //KOD KONTROL
    if (hatalar.length > 0) {
      return res.render('email-dogrula', { hatalar, eskiBilgi }); //HATA VARSA EN BAŞA DÖNME GİBİ
    }

    const [kullanicilar] = await db.query('SELECT * FROM kullanicilar WHERE email = ?', [email]); //KULLANICIYI BULDUK.

    const kullanici = kullanicilar[0];

    const [kodlar] = await db.query(
      `SELECT * FROM email_dogrulamalari
       WHERE kullanici_id = ? AND kod = ? AND kullanildi_mi = 0 AND son_tarih > NOW()
       ORDER BY id DESC LIMIT 1`,
      [kullanici.id, kod]
    );

    if (kodlar.length === 0) { //O MAILE AIT KOD GÖZÜKMÜYORSA
      return res.render('email-dogrula', { hatalar: ['Kod hatalı, kullanılmış veya süresi geçmiş olabilir.'], eskiBilgi });
    }

    await db.query('UPDATE kullanicilar SET dogrulandi_mi = 1 WHERE id = ?', [kullanici.id]);
    await db.query('UPDATE email_dogrulamalari SET kullanildi_mi = 1 WHERE id = ?', [kodlar[0].id]);

    req.session.mesajBasari = 'Email doğrulandı.';
    res.redirect('/giris');
  } catch (hata) {
    next(hata);
  }
});

app.get('/giris', (req, res) => {
  res.render('giris', { hatalar: [], eskiBilgi: {} }); //ÖNCE BOŞ
});

app.post('/giris', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim();
    const sifre = req.body.sifre || '';
    const eskiBilgi = { email };

    if (!emailDogruMu(email) || bosMu(sifre)) {
      return res.render('giris', { hatalar: ['Email formatı yanlış veya şifre alanı boş.'], eskiBilgi });
    }

    const [kullanicilar] = await db.query('SELECT * FROM kullanicilar WHERE email = ?', [email]);
    if (kullanicilar.length === 0) {
      return res.render('giris', { hatalar: ['Email veya şifre hatalı.'], eskiBilgi });
    }

    const kullanici = kullanicilar[0];
    if (!kullanici.dogrulandi_mi) {
      return res.render('giris', { hatalar: ['Önce doğrulama yapmalısınız.'], eskiBilgi });
    }

    const sifreDogruMu = await bcrypt.compare(sifre, kullanici.sifre_hash); //BURASI HAZIR GELİYOR.

    if (!sifreDogruMu) {
      return res.render('giris', { hatalar: ['Şifre hatalı.'], eskiBilgi });
    }

    req.session.kullanici = {
      id: kullanici.id,
      email: kullanici.email,
      rol: kullanici.rol,
      ad: kullanici.ad,
      sehir: kullanici.sehir,
      ilce: kullanici.ilce
    };

    if (kullanici.rol === 'market') 
      return res.redirect('/market-panel'); //BIRASI DAHA SONRA YAZCAM
    res.redirect('/arama'); //BURASI DA DAHA SONRA
  } catch (hata) {
    next(hata);
  }
});

app.post('/cikis', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/profil', girisGerekli, (req, res) => { //GİRİS YAPMAMIS BİRİYSE BURASI CALISMAZ
  res.render('profil', { hatalar: [], eskiBilgi: req.session.kullanici });
});

app.post('/profil', girisGerekli, async (req, res, next) => {
  try {
    const eskiBilgi = {
      email: req.session.kullanici.email,
      ad: req.body.ad,
      sehir: req.body.sehir,
      ilce: req.body.ilce
    };
    const hatalar = [];
    if (bosMu(req.body.ad)) hatalar.push('Ad boş olamaz.');
    if (bosMu(req.body.sehir)) hatalar.push('Şehir boş olamaz.');
    if (bosMu(req.body.ilce)) hatalar.push('İlçe boş olamaz.'); //SIRASIYA BOŞ ALAN KONTROLÜ YAPTIK

    if (hatalar.length > 0) 
      return res.render('profil', { hatalar, eskiBilgi }); //HATA VARSA BURASI

    await db.query(
      'UPDATE kullanicilar SET ad = ?, sehir = ?, ilce = ? WHERE id = ?',
      [req.body.ad.trim(), req.body.sehir.trim(), req.body.ilce.trim(), req.session.kullanici.id]
    );

    req.session.kullanici.ad = req.body.ad.trim();
    req.session.kullanici.sehir = req.body.sehir.trim();
    req.session.kullanici.ilce = req.body.ilce.trim();
    req.session.mesajBasari = 'Profil bilgileri güncellendi.';
    res.redirect('/profil');
  } catch (hata) {
    next(hata);
  }
});





function marketGerekli(req, res, next) {
  if (!req.session.kullanici || req.session.kullanici.rol !== 'market') {
    req.session.mesajHata = 'Bu sayfa sadece market kullanıcıları içindir.';
    return res.redirect('/giris');
  }
  next();
}

function musteriGerekli(req, res, next) {
  if (!req.session.kullanici || req.session.kullanici.rol !== 'musteri') {
    req.session.mesajHata = 'Bu sayfa sadece müşteri kullanıcıları içindir.';
    return res.redirect('/giris');
  }
  next();
}



app.get('/market-panel', marketGerekli, async (req, res, next) => { 
  try {
    const [urunler] = await db.query(
      `SELECT *, DATEDIFF(son_kullanma_tarihi, CURDATE()) AS kalan_gun,
              CASE WHEN son_kullanma_tarihi < CURDATE() THEN 1 ELSE 0 END AS tarihi_gecti_mi
       FROM urunler
       WHERE market_id = ?
       ORDER BY son_kullanma_tarihi ASC`,
      [req.session.kullanici.id]
    );

    res.render('market-panel', { urunler });
  } catch (hata) {
    next(hata);
  }
});

const yuklemeAyarlari = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uzanti = path.extname(file.originalname).toLowerCase();
    const dosyaAdi = Date.now() + '-' + Math.round(Math.random() * 100000) + uzanti;
    cb(null, dosyaAdi);
  }
});


const resimYukle = multer({
  storage: yuklemeAyarlari,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const izinVerilenTipler = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (izinVerilenTipler.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyasi yukleyebilirsiniz.'));
    }
  }
});




app.get('/urun-ekle', marketGerekli, (req, res) => {
  res.render('urun-form', {
    formBaslik: 'Yeni Urun Ekle',
    formAction: '/urun-ekle',
    hatalar: [],
    eskiBilgi: {},
    urun: null
  });
});

app.post('/urun-ekle', marketGerekli, resimYukle.single('resim'), async (req, res, next) => {
  try {
    const eskiBilgi = req.body;
    const hatalar = urunHatalariGetir(req.body);

    if (hatalar.length > 0) {
      return res.render('urun-form', {
        formBaslik: 'Yeni Urun Ekle',
        formAction: '/urun-ekle',
        hatalar,
        eskiBilgi,
        urun: null
      });
    }

    const resimYolu = req.file ? '/uploads/' + req.file.filename : '/uploads/default-product.svg';

    await db.query(
      `INSERT INTO urunler (market_id, baslik, stok, normal_fiyat, indirimli_fiyat, son_kullanma_tarihi, resim_yolu)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.kullanici.id,
        req.body.baslik.trim(),
        Number(req.body.stok),
        Number(req.body.normalFiyat),
        Number(req.body.indirimliFiyat),
        req.body.sonKullanmaTarihi,
        resimYolu
      ]
    );

    req.session.mesajBasari = 'Urun eklendi.';
    res.redirect('/market-panel');
  } catch (hata) {
    next(hata);
  }
});

app.get('/urun-duzenle/:id', marketGerekli, async (req, res, next) => {
  try {
    const urunId = Number(req.params.id);
    const [urunler] = await db.query(
      'SELECT * FROM urunler WHERE id = ? AND market_id = ?',
      [urunId, req.session.kullanici.id]
    );

    if (urunler.length === 0) {
      req.session.mesajHata = 'Urun bulunamadi veya size ait degil.';
      return res.redirect('/market-panel');
    }

    res.render('urun-form', {
      formBaslik: 'Urun Duzenle',
      formAction: '/urun-duzenle/' + urunId,
      hatalar: [],
      eskiBilgi: {},
      urun: urunler[0]
    });
  } catch (hata) {
    next(hata);
  }
});

app.post('/urun-duzenle/:id', marketGerekli, resimYukle.single('resim'), async (req, res, next) => {
  try {
    const urunId = Number(req.params.id);
    const [urunler] = await db.query(
      'SELECT * FROM urunler WHERE id = ? AND market_id = ?',
      [urunId, req.session.kullanici.id]
    );

    if (urunler.length === 0) {
      req.session.mesajHata = 'Urun bulunamadi veya size ait degil.';
      return res.redirect('/market-panel');
    }

    const eskiBilgi = req.body;
    const hatalar = urunHatalariGetir(req.body);

    if (hatalar.length > 0) {
      return res.render('urun-form', {
        formBaslik: 'Urun Duzenle',
        formAction: '/urun-duzenle/' + urunId,
        hatalar,
        eskiBilgi,
        urun: urunler[0]
      });
    }

    const resimYolu = req.file ? '/uploads/' + req.file.filename : urunler[0].resim_yolu;

    await db.query(
      `UPDATE urunler
       SET baslik = ?, stok = ?, normal_fiyat = ?, indirimli_fiyat = ?, son_kullanma_tarihi = ?, resim_yolu = ?
       WHERE id = ? AND market_id = ?`,
      [
        req.body.baslik.trim(),
        Number(req.body.stok),
        Number(req.body.normalFiyat),
        Number(req.body.indirimliFiyat),
        req.body.sonKullanmaTarihi,
        resimYolu,
        urunId,
        req.session.kullanici.id
      ]
    );

    req.session.mesajBasari = 'Urun guncellendi.';
    res.redirect('/market-panel');
  } catch (hata) {
    next(hata);
  }
});

app.post('/urun-sil/:id', marketGerekli, async (req, res, next) => {
  try {
    const urunId = Number(req.params.id);
    const [sonuc] = await db.query(
      'DELETE FROM urunler WHERE id = ? AND market_id = ?',
      [urunId, req.session.kullanici.id]
    );

    if (sonuc.affectedRows === 0) {
      req.session.mesajHata = 'Urun silinemedi.';
    } else {
      req.session.mesajBasari = 'Urun silindi.';
    }

    res.redirect('/market-panel');
  } catch (hata) {
    next(hata);
  }
});


app.get('/arama', musteriGerekli, async (req, res, next) => {
  try {
    const aramaKelimesi = (req.query.q || '').trim();
    const sayfaNo = Math.max(parseInt(req.query.sayfa || '1', 10), 1);
    const sayfaLimiti = 4;
    const baslangic = (sayfaNo - 1) * sayfaLimiti;
    const likeKelime = '%' + aramaKelimesi + '%';

    const [sayacSatirlari] = await db.query(
      `SELECT COUNT(*) AS toplam
       FROM urunler u
       JOIN kullanicilar m ON m.id = u.market_id
       WHERE m.sehir = ?
         AND u.baslik LIKE ?
         AND u.stok > 0
         AND u.son_kullanma_tarihi >= CURDATE()`,
      [req.session.kullanici.sehir, likeKelime]
    );

    const toplamUrun = Number(sayacSatirlari[0].toplam || 0);
    const toplamSayfa = Math.max(Math.ceil(toplamUrun / sayfaLimiti), 1);

    const [urunler] = await db.query(
      `SELECT u.*, m.ad AS market_adi, m.sehir, m.ilce,
              DATEDIFF(u.son_kullanma_tarihi, CURDATE()) AS kalan_gun
       FROM urunler u
       JOIN kullanicilar m ON m.id = u.market_id
       WHERE m.sehir = ?
         AND u.baslik LIKE ?
         AND u.stok > 0
         AND u.son_kullanma_tarihi >= CURDATE()
       ORDER BY CASE WHEN m.ilce = ? THEN 0 ELSE 1 END,
                u.son_kullanma_tarihi ASC,
                u.indirimli_fiyat ASC
       LIMIT ${sayfaLimiti} OFFSET ${baslangic}`,
      [req.session.kullanici.sehir, likeKelime, req.session.kullanici.ilce]
    );

    res.render('musteri-arama', {
      urunler,
      aramaKelimesi,
      sayfaNo,
      toplamSayfa,
      toplamUrun
    });
  } catch (hata) {
    next(hata);
  }
});

app.post('/sepete-ekle', musteriGerekli, async (req, res, next) => {
  try {
    const urunId = Number(req.body.urunId);

    const [urunler] = await db.query(
      `SELECT u.*
       FROM urunler u
       JOIN kullanicilar m ON m.id = u.market_id
       WHERE u.id = ?
         AND m.sehir = ?
         AND u.stok > 0
         AND u.son_kullanma_tarihi >= CURDATE()`,
      [urunId, req.session.kullanici.sehir]
    );

    if (urunler.length === 0) {
      req.session.mesajHata = 'Bu urun sepete eklenemez.';
      return res.redirect('/arama');
    }

    const urun = urunler[0];

    const [sepetSatirlari] = await db.query(
      'SELECT * FROM sepet_urunleri WHERE musteri_id = ? AND urun_id = ?',
      [req.session.kullanici.id, urunId]
    );

    if (sepetSatirlari.length > 0) {
      if (sepetSatirlari[0].adet >= urun.stok) {
        req.session.mesajHata = 'Sepetteki adet stok miktarini gecemez.';
        return res.redirect('/arama?q=' + encodeURIComponent(req.body.q || ''));
      }

      await db.query(
        'UPDATE sepet_urunleri SET adet = adet + 1 WHERE id = ?',
        [sepetSatirlari[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO sepet_urunleri (musteri_id, urun_id, adet) VALUES (?, ?, 1)',
        [req.session.kullanici.id, urunId]
      );
    }

    req.session.mesajBasari = 'Urun sepete eklendi.';
    res.redirect('/arama?q=' + encodeURIComponent(req.body.q || ''));
  } catch (hata) {
    next(hata);
  }
});

app.get('/sepet', musteriGerekli, async (req, res, next) => {
  try {
    const [sepetUrunleri] = await db.query(
      `SELECT s.id AS sepet_id, s.adet, u.id AS urun_id, u.baslik, u.indirimli_fiyat, u.stok,
              u.resim_yolu, u.son_kullanma_tarihi, m.ad AS market_adi,
              (s.adet * u.indirimli_fiyat) AS urun_toplam
       FROM sepet_urunleri s
       JOIN urunler u ON u.id = s.urun_id
       JOIN kullanicilar m ON m.id = u.market_id
       WHERE s.musteri_id = ?
       ORDER BY s.id DESC`,
      [req.session.kullanici.id]
    );

    const genelToplam = sepetUrunleri.reduce((toplam, satir) => {
      return toplam + Number(satir.urun_toplam);
    }, 0);

    res.render('sepet', { sepetUrunleri, genelToplam });
  } catch (hata) {
    next(hata);
  }
});

app.post('/sepet-guncelle', musteriGerekli, async (req, res, next) => {
  try {
    const sepetId = Number(req.body.sepetId);
    const yeniAdet = Number(req.body.yeniAdet);

    if (!Number.isInteger(sepetId) || !Number.isInteger(yeniAdet)) {
      return res.json({ basarili: false, mesaj: 'Gecersiz istek.' });
    }

    const [satirlar] = await db.query(
      `SELECT s.*, u.stok, u.indirimli_fiyat
       FROM sepet_urunleri s
       JOIN urunler u ON u.id = s.urun_id
       WHERE s.id = ? AND s.musteri_id = ?`,
      [sepetId, req.session.kullanici.id]
    );

    if (satirlar.length === 0) {
      return res.json({ basarili: false, mesaj: 'Sepet urunu bulunamadi.' });
    }

    if (yeniAdet < 1) {
      await db.query(
        'DELETE FROM sepet_urunleri WHERE id = ? AND musteri_id = ?',
        [sepetId, req.session.kullanici.id]
      );

      const genelToplam = await sepetToplamiGetir(req.session.kullanici.id);

      return res.json({
        basarili: true,
        silindi: true,
        genelToplam: genelToplam.toFixed(2),
        mesaj: 'Urun sepetten silindi.'
      });
    }

    if (yeniAdet > satirlar[0].stok) {
      return res.json({ basarili: false, mesaj: 'Stok miktarindan fazla urun secilemez.' });
    }

    await db.query(
      'UPDATE sepet_urunleri SET adet = ? WHERE id = ? AND musteri_id = ?',
      [yeniAdet, sepetId, req.session.kullanici.id]
    );

    const urunToplam = yeniAdet * Number(satirlar[0].indirimli_fiyat);
    const genelToplam = await sepetToplamiGetir(req.session.kullanici.id);

    res.json({
      basarili: true,
      urunToplam: urunToplam.toFixed(2),
      genelToplam: genelToplam.toFixed(2),
      mesaj: 'Sepet guncellendi.'
    });
  } catch (hata) {
    next(hata);
  }
});

app.post('/sepet-sil', musteriGerekli, async (req, res, next) => {
  try {
    const sepetId = Number(req.body.sepetId);

    await db.query(
      'DELETE FROM sepet_urunleri WHERE id = ? AND musteri_id = ?',
      [sepetId, req.session.kullanici.id]
    );

    const genelToplam = await sepetToplamiGetir(req.session.kullanici.id);

    res.json({
      basarili: true,
      genelToplam: genelToplam.toFixed(2),
      mesaj: 'Urun sepetten silindi.'
    });
  } catch (hata) {
    next(hata);
  }
});


app.use((req, res) => {
  res.status(404).render('hata', { mesaj: 'Sayfa bulunamadı.' });
});

app.use((hata, req, res, next) => {
  console.error(hata);
  const mesaj = hata.message || 'Beklenmeyen bir hata oluştu.';
  res.status(500).render('hata', { mesaj });
});

app.listen(PORT, () => {
  console.log(`PORT IS : ${PORT}`);
});