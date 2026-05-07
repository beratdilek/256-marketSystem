/*------------------AJAX------------------*/

function mesajGoster(tip, mesaj) 
{
  const mesajAlani = document.getElementById('ajaxMesaj');
  if (!mesajAlani) 
    return;
  mesajAlani.innerHTML = `<div class="alert alert-${tip}">${mesaj}</div>`; //BURAYA ALERT SUCCESS GÖNDERCEZ
}

function genelToplamYaz(yeniToplam) {
  const genelToplam = document.getElementById('genelToplam');
  if (genelToplam) 
    genelToplam.textContent = yeniToplam; //TOPLAM FİYAT YENİ FİYATLA GÜNCELLENCEK.
}

async function jsonPost(url, veri) {
  const cevap = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(veri)
  });
  return cevap.json();
}

document.querySelectorAll('.adet-input').forEach(input => {
  input.addEventListener('change', async () => {
    const satir = input.closest('tr');
    const sepetId = satir.dataset.sepetId;
    const yeniAdet = Number(input.value);

    const sonuc = await jsonPost('/sepet-guncelle', { sepetId, yeniAdet });

    if (!sonuc.basarili) {
      mesajGoster('alert', sonuc.mesaj);
      return;
    }

    if (sonuc.silindi) {
      satir.remove();
    } else {
      satir.querySelector('.urun-toplam').textContent = sonuc.urunToplam;
    }

    genelToplamYaz(sonuc.genelToplam);
    mesajGoster('success', sonuc.mesaj);
  });
});

document.querySelectorAll('.sil-btn').forEach(button => {
  button.addEventListener('click', async () => {
    const satir = button.closest('tr');
    const sepetId = satir.dataset.sepetId;

    const sonuc = await jsonPost('/sepet-sil', { sepetId });

    if (!sonuc.basarili) {
      mesajGoster('danger', sonuc.mesaj || 'Silme islemi basarisiz.');
      return;
    }

    satir.remove();
    genelToplamYaz(sonuc.genelToplam);
    mesajGoster('success', sonuc.mesaj);
  });
});

const satinAlBtn = document.getElementById('satinAlBtn');
if (satinAlBtn) {
  satinAlBtn.addEventListener('click', async () => {
    if (!confirm('Sepeti satin almak istiyor musunuz?')) return;

    const sonuc = await jsonPost('/satin-al', {});

    if (!sonuc.basarili) {
      mesajGoster('danger', sonuc.mesaj);
      return;
    }

    mesajGoster('success', sonuc.mesaj);
    document.querySelectorAll('tbody tr').forEach(satir => satir.remove());
    genelToplamYaz('0.00');
    satinAlBtn.disabled = true;
  });
}