require('dotenv').config();

const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const nodemailer = require('nodemailer');

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

function emailDogruMu(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function dogrulamaKoduOlustur() {
  return String(Math.floor(100000 + Math.random() * 900000)); //RASTGELE DOĞRULAMA KODU OLUŞTURMAK İÇİN -> HER ZAMAN 6 HANE
}

async function mailKoduGonder(email, kod) { //EMAIL'E KOD GÖNDERMEK İÇİN HAZIR FONKSİYON
  const transporter = nodemailer.createTransport({
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
    subject: 'Sustainable Discount Marketplace Doğrulama Kodu',
    text: `Doğrulama kodunuz: ${kod}. Bu kod 10 dakika geçerlidir.`
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

app.use((req, res) => {
  res.status(404).render('hata', { mesaj: 'Sayfa bulunamadi.' });
});

app.listen(PORT, () => {
  console.log(`PORT IS : ${PORT}`);
});