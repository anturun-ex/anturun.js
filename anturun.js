// ==========================================
// ANTURUN.JS - Core Logic Application
// ==========================================

// -- PENGATURAN TOKO & BIAYA --
const NOMOR_WA_ADMIN = "6285601232027"; // Format WA 62
const BIAYA_LAYANAN = 1000;
const BASE_ONGKIR = 5000;
const ONGKIR_PER_KM = 2000;
const BIAYA_MULTI_TOKO_PER_EXTRA = 2000; // Biaya per toko ekstra

// -- PENGATURAN QRIS STATIS ANDA --
const STRING_QRIS_STATIS = "00020101021126570011ID.DANA.WWW011893600915306035130202090603513020303UMI51440014ID.CO.QRIS.WWW0215ID10200435286340303UMI5204573253033605802ID5911Waroeng ANU6014Kab. Indramayu610545261630450E4"; 

// -- PENGATURAN VOUCHER --
const VOUCHERS = {
    "HEMAT10K": { type: "nominal", value: 10000, minPurchase: 50000, desc: "Diskon Rp 10.000", maxUsesPerDay: 1 },
    "DISKON20": { type: "percent", value: 20, maxDiscount: 15000, minPurchase: 40000, desc: "Diskon 20%", maxUsesPerDay: 2 }
};
let appliedVoucher = null;

// -- STATE DATA & VARIABLE GLOBAL --
let cart = JSON.parse(localStorage.getItem('shopeefood_cart')) || [];
let buyerInfo = JSON.parse(localStorage.getItem('shopeefood_buyer')) || {
    nama: '', nomor: '', alamat: '', kordinat: '', jarak: 0, lastStoreConfig: ''
};

// Data Checkout Sementara
let pendingCheckoutData = null;

// Peta Leaflet Variable
let map;
let routingControl = null;
let mapInitialized = false;

// Multi Profile Variabel
let multiProfiles = JSON.parse(localStorage.getItem('anturun_multi_profiles')) || [
    { label: 'Alamat 1', nama: '', nomor: '', alamat: '', kordinat: '', jarak: 0 },
    { label: 'Alamat 2', nama: '', nomor: '', alamat: '', kordinat: '', jarak: 0 },
    { label: 'Alamat 3', nama: '', nomor: '', alamat: '', kordinat: '', jarak: 0 }
];
let activeProfileIdx = parseInt(localStorage.getItem('anturun_active_profile_idx')) || 0;
// Pastikan profil lama yang belum punya label tidak error
multiProfiles.forEach((p, i) => { if(!p.label) p.label = 'Alamat ' + (i+1); });


// ==========================================
// 1. UTILITAS & FUNGSI UMUM
// ==========================================
function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

function getVoucherUsage(code) {
    let usageData = JSON.parse(localStorage.getItem('shopeefood_voucher_usage')) || {};
    let today = getTodayDateStr();
    if (usageData[code] && usageData[code].date === today) return usageData[code].count;
    return 0;
}

function incrementVoucherUsage(code) {
    let usageData = JSON.parse(localStorage.getItem('shopeefood_voucher_usage')) || {};
    let today = getTodayDateStr();
    if (usageData[code] && usageData[code].date === today) {
        usageData[code].count += 1;
    } else {
        usageData[code] = { date: today, count: 1 };
    }
    localStorage.setItem('shopeefood_voucher_usage', JSON.stringify(usageData));
}

function formatRp(angka) {
    return "Rp " + angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function checkStoreStatus(jamString) {
    if (!jamString) return true; // Default buka
    try {
        let parts = jamString.split('-');
        if(parts.length !== 2) return true;
        let openTime = parts[0].trim().split(':');
        let closeTime = parts[1].trim().split(':');

        let now = new Date();
        let currentMinutes = now.getHours() * 60 + now.getMinutes();
        let openMinutes = parseInt(openTime[0], 10) * 60 + parseInt(openTime[1], 10);
        let closeMinutes = parseInt(closeTime[0], 10) * 60 + parseInt(closeTime[1], 10);

        if (openMinutes < closeMinutes) {
            return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
        } else {
            return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
        }
    } catch(e) {
        return true;
    }
}

function kunjungiTokoPencarian(btn) {
    var container = btn.closest('.flex.items-center');
    if (container) {
        var tokoEl = container.querySelector('.sc-toko');
        if (tokoEl) {
            var tokoName = tokoEl.innerText;
            if (tokoName && tokoName !== 'Mitra Toko') {
                window.location.href = '/search?q=' + encodeURIComponent('"' + tokoName + '"') + '&toko=1';
            }
        }
    }
}


// ==========================================
// 2. INISIALISASI DOM (PWA, Parsing DOM)
// ==========================================
document.addEventListener("DOMContentLoaded", function() {

    // --- A. Generate Web App Manifest ---
    var manifest = {
        "name": document.title,
        "short_name": "Anturun",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#F5F5F5",
        "theme_color": "#EE4D2D",
        "description": "Aplikasi Pemesanan Makanan Online",
        "icons": [
            { "src": "https://cdn-icons-png.flaticon.com/512/3143/3143644.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
            { "src": "https://cdn-icons-png.flaticon.com/512/3143/3143644.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
        ]
    };
    var stringManifest = JSON.stringify(manifest);
    var blob = new Blob([stringManifest], {type: 'application/manifest+json'});
    var manifestURL = URL.createObjectURL(blob);
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = manifestURL;
    document.head.appendChild(link);

    // --- B. Setup Logic PWA Swipe to Close Bottom Sheet ---
    function attachSwipe(modalId, scrollAreaId, closeFunc) {
        var modal = document.getElementById(modalId);
        var scrollArea = document.getElementById(scrollAreaId);
        if (!modal || !scrollArea) return;

        var startY = 0, currentY = 0, isDragging = false;

        modal.addEventListener('touchstart', function(e) {
            if (scrollArea.scrollTop > 0) return;
            if (e.target.closest('#mapContainer')) return;
            
            // Abaikan logika swipe jika menyentuh form
            const tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'button') return;
            
            startY = e.touches[0].clientY;
            currentY = startY; 
            isDragging = true;
            modal.style.transition = 'none';
        }, {passive: true});

        modal.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            var deltaY = currentY - startY;

            if (deltaY > 0) {
                if (e.cancelable) e.preventDefault();
                modal.style.transform = 'translateY(' + deltaY + 'px)';
            }
        }, {passive: false});

        modal.addEventListener('touchend', function(e) {
            if (!isDragging) return;
            isDragging = false;
            var deltaY = currentY - startY;
            modal.style.transition = 'transform 0.3s ease-out';
            
            if (deltaY > 100) {
                modal.style.transform = ''; 
                closeFunc();
            } else {
                modal.style.transform = '';
            }
        });
    }
    attachSwipe('cartModal', 'cartScrollArea', window.toggleCartModal);
    attachSwipe('profileModal', 'profileScrollArea', window.toggleProfileModal);

    // --- C. Banner Profil Toko (Pencarian Toko) ---
    setTimeout(function() {
        var urlParams = new URLSearchParams(window.location.search);
        var query = urlParams.get('q');
        var isTokoVisit = urlParams.get('toko') === '1';
        
        if (query && isTokoVisit && document.getElementById('storeHeaderPlaceholder')) {
            var storeElements = document.querySelectorAll('.sc-toko');
            if (storeElements.length > 0) {
                var firstStore = storeElements[0].innerText;
                var isSameStore = true;
                
                for (var i = 1; i < storeElements.length; i++) {
                    if (storeElements[i].innerText !== firstStore) {
                        isSameStore = false; break;
                    }
                }
                
                if (isSameStore && firstStore !== 'Mitra Toko') {
                    var firstContainer = storeElements[0].closest('.post-container-parse');
                    var jamEl = firstContainer.querySelector('.sc-jam');
                    var jamText = jamEl ? jamEl.innerText.replace('🕒 Jam Operasional: ', '') : '';
                    
                    var header = document.getElementById('storeHeaderPlaceholder');
                    document.getElementById('shTokoName').innerText = firstStore;
                    
                    if (jamText) {
                       document.getElementById('shTokoJam').innerText = "🕒 " + jamText;
                       var btn = firstContainer.querySelector('.btn-add-cart');
                       var isTutup = btn && btn.innerText.includes('TUTUP');
                       var statusEl = document.getElementById('shTokoStatus');
                       
                       statusEl.classList.remove('hidden');
                       if (isTutup) {
                           statusEl.innerText = 'TUTUP';
                           statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-sm inline-block bg-red-100 text-red-600 border border-red-200';
                       } else {
                           statusEl.innerText = 'BUKA';
                           statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-sm inline-block bg-green-100 text-green-600 border border-green-200';
                       }
                    }
                    header.classList.remove('hidden');
                    header.classList.add('flex');
                    
                    var recTitle = document.getElementById('titleRekomendasi');
                    if (recTitle) {
                        recTitle.innerHTML = "<svg class='w-4 h-4 mr-1 text-shopee' fill='currentColor' viewBox='0 0 20 20'><path fill-rule='evenodd' d='M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 15a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1z' clip-rule='evenodd'/></svg> Daftar Menu Toko";
                    }

                    var pageLinks = document.querySelectorAll('.py-6.gap-4 a');
                    pageLinks.forEach(function(a) {
                        var href = a.getAttribute('href');
                        if (href && !href.includes('toko=1')) {
                            a.setAttribute('href', href + (href.includes('?') ? '&' : '?') + 'toko=1');
                        }
                    });
                }
            }
        }
    }, 600);

    // --- D. Eksekusi Shortcode (Merubah Tampilan Harga dll) ---
    initBuyerInfo();

    const containers = document.querySelectorAll('.post-container-parse');
    containers.forEach(container => {
        const rawBodyEl = container.querySelector('.post-body-raw');
        if (!rawBodyEl) return;
        
        let htmlContent = rawBodyEl.innerHTML;
        const extractValue = (regex) => {
            const match = htmlContent.match(regex);
            if (match) {
                htmlContent = htmlContent.replace(match[0], '');
                return match[1].replace(/(<([^>]+)>)/gi, "").trim();
            }
            return null;
        };

        const valHarga = extractValue(/\[harga\]([\s\S]*?)\[\/harga\]/i);
        const valHargaCoret = extractValue(/\[hargacoret\]([\s\S]*?)\[\/hargacoret\]/i);
        const valToko = extractValue(/\[toko\]([\s\S]*?)\[\/toko\]/i);
        const valRingkasan = extractValue(/\[ringkasan\]([\s\S]*?)\[\/ringkasan\]/i);
        const valKordinatToko = extractValue(/\[kordinattoko\]([\s\S]*?)\[\/kordinattoko\]/i);
        const valJam = extractValue(/\[jam\]([\s\S]*?)\[\/jam\]/i);
        
        const elHarga = container.querySelector('.sc-harga');
        const elHargaCoret = container.querySelector('.sc-hargacoret');
        const elHargaCoretContainer = container.querySelector('.sc-hargacoret-container');
        const elToko = container.querySelector('.sc-toko');
        const elRingkasan = container.querySelector('.sc-ringkasan');
        const elJam = container.querySelector('.sc-jam');
        const overlayTutup = container.querySelector('.sc-overlay-tutup');
        const btnAdd = container.querySelector('.btn-add-cart');
        const btnBeli = container.querySelector('.btn-beli-sekarang');
        
        if (elHarga && valHarga) elHarga.innerText = valHarga;
        if (elToko && valToko) elToko.innerText = valToko;
        if (elRingkasan && valRingkasan) elRingkasan.innerText = valRingkasan;
        if (valKordinatToko) container.setAttribute('data-kordinattoko', valKordinatToko);

        let isTutup = false;
        if (valJam) {
            if (elJam) elJam.innerText = "🕒 Jam Operasional: " + valJam;
            isTutup = !checkStoreStatus(valJam);
        }

        if (isTutup) {
            if (overlayTutup) {
                overlayTutup.classList.remove('hidden');
                overlayTutup.classList.add('flex');
            }
            if (btnAdd) {
                btnAdd.classList.remove('btn-add-cart', 'bg-orange-50', 'text-shopee', 'hover:bg-shopee', 'hover:text-white', 'hover:bg-orange-100', 'cursor-pointer');
                btnAdd.classList.add('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
                btnAdd.innerHTML = '<span class="text-xs font-bold w-full text-center">TUTUP</span>';
                btnAdd.style.pointerEvents = 'none';
            }
            if (btnBeli) {
                btnBeli.classList.remove('bg-shopee', 'hover:bg-shopeehover', 'cursor-pointer');
                btnBeli.classList.add('bg-gray-300', 'text-gray-500', 'cursor-not-allowed');
                btnBeli.removeAttribute('onclick');
                btnBeli.innerHTML = '<span class="text-xs md:text-sm font-bold">Toko Tutup</span>';
                btnBeli.style.pointerEvents = 'none';
            }
        }

        if (elHargaCoret && valHargaCoret) {
            elHargaCoret.innerText = valHargaCoret;
            if (elHargaCoretContainer) {
                elHargaCoretContainer.classList.remove('hidden');
                elHargaCoretContainer.classList.add('flex');
            }
        }
        rawBodyEl.remove();
    });

    updateCartBadge();

    // --- E. Inisialisasi Deteksi Tombol Add Cart ---
    document.body.addEventListener('click', function(e) {
        const btn = e.target.closest('.btn-add-cart');
        if (!btn) return;
        
        const container = btn.closest('.post-container-parse');
        if (!container) return;

        const title = container.getAttribute('data-title');
        const img = container.getAttribute('data-image');
        const kordinatTokoAttr = container.getAttribute('data-kordinattoko');
        
        const tokoEl = container.querySelector('.sc-toko');
        const hargaEl = container.querySelector('.sc-harga');
        const hargaCoretEl = container.querySelector('.sc-hargacoret');
        
        if(!tokoEl || !hargaEl) return;

        const toko = tokoEl.innerText;
        const hargaRaw = hargaEl.innerText.replace(/[^0-9]/g, '');
        const harga = parseInt(hargaRaw) || 0;
        
        let originalPrice = harga;
        if (hargaCoretEl) {
           const hcRaw = hargaCoretEl.innerText.replace(/[^0-9]/g, '');
           if (hcRaw) originalPrice = parseInt(hcRaw) || harga;
        }
        if (originalPrice < harga) originalPrice = harga; 

        let storeLat = -6.200000;
        let storeLng = 106.816666;
        if (kordinatTokoAttr) {
            const parts = kordinatTokoAttr.split(',');
            if(parts.length === 2) {
                storeLat = parseFloat(parts[0].trim());
                storeLng = parseFloat(parts[1].trim());
            }
        }

        tambahItem(title, harga, toko, img, originalPrice, storeLat, storeLng);
        
        const originalText = btn.innerHTML;
        btn.innerHTML = `<span class="text-xs font-bold w-full text-center">✔ Ditambahkan</span>`;
        btn.classList.add('bg-green-100', 'text-green-700', 'border-green-200');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('bg-green-100', 'text-green-700', 'border-green-200');
        }, 1500);
    });

    // --- F. Deteksi Pembukaan Modal Untuk Merapihkan Multi-Profile UI ---
    const profileObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.classList.contains('flex')) {
                window.switchProfile(activeProfileIdx);
                window.updateCartProfileDisplay();
            }
        });
    });

    const profileModalWrapper = document.getElementById('profileModalWrapper');
    if (profileModalWrapper) {
        profileObserver.observe(profileModalWrapper, { attributes: true, attributeFilter: ['class'] });
    }

    // Inisialisasi awal multi-profile UI
    window.renderProfileTabs();
    setTimeout(() => {
        window.updateCartProfileDisplay();
    }, 1000);
});

// ==========================================
// 3. LOGIKA MULTI-PROFILE & DATA PEMBELI
// ==========================================
window.renderProfileTabs = function() {
    for(let i=0; i<3; i++) {
        let btn = document.getElementById('tab-profile-' + i);
        if(btn) {
            btn.innerText = multiProfiles[i].label || ('Alamat ' + (i+1));
            if(i === activeProfileIdx) {
                // Tailwind color bg-shopee = bg-anturun (#EE4D2D)
                btn.className = "flex-1 py-2 px-1 truncate text-xs font-bold rounded-sm border border-[#EE4D2D] bg-[#EE4D2D] text-white shadow-sm transition outline-none";
            } else {
                btn.className = "flex-1 py-2 px-1 truncate text-xs font-bold rounded-sm border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition outline-none";
            }
        }
    }
}

window.switchProfile = function(idx) {
    let dJarakText = document.getElementById('displayJarak') ? document.getElementById('displayJarak').innerText : "0";
    let jarakNum = parseFloat(dJarakText) || multiProfiles[activeProfileIdx].jarak || 0;
    
    multiProfiles[activeProfileIdx] = {
        label: document.getElementById('profLabel').value || ('Alamat ' + (activeProfileIdx + 1)),
        nama: document.getElementById('profNama').value,
        nomor: document.getElementById('profNomor').value,
        alamat: document.getElementById('profAlamat').value,
        kordinat: document.getElementById('profKordinat').value,
        jarak: jarakNum
    };

    activeProfileIdx = idx;
    localStorage.setItem('anturun_active_profile_idx', activeProfileIdx);
    window.renderProfileTabs();

    let p = multiProfiles[idx];
    document.getElementById('profLabel').value = p.label || ('Alamat ' + (idx + 1));
    document.getElementById('profNama').value = p.nama || '';
    document.getElementById('profNomor').value = p.nomor || '';
    document.getElementById('profAlamat').value = p.alamat || '';
    document.getElementById('profKordinat').value = p.kordinat || '';
    
    if(p.jarak) {
        document.getElementById('displayJarak').innerText = p.jarak + " km";
    } else {
        document.getElementById('displayJarak').innerText = "Belum dihitung";
    }

    if(typeof initLeafletMap === 'function') {
        initLeafletMap();
    }
}

window.saveMultiProfile = function(btnEvent) {
    let dJarakText = document.getElementById('displayJarak').innerText;
    let jarakNum = parseFloat(dJarakText) || multiProfiles[activeProfileIdx].jarak || 0;

    multiProfiles[activeProfileIdx] = {
        label: document.getElementById('profLabel').value || ('Alamat ' + (activeProfileIdx + 1)),
        nama: document.getElementById('profNama').value,
        nomor: document.getElementById('profNomor').value,
        alamat: document.getElementById('profAlamat').value,
        kordinat: document.getElementById('profKordinat').value,
        jarak: jarakNum
    };

    localStorage.setItem('anturun_multi_profiles', JSON.stringify(multiProfiles));
    localStorage.setItem('anturun_active_profile_idx', activeProfileIdx);

    let activeP = multiProfiles[activeProfileIdx];
    localStorage.setItem('shopeefood_buyer', JSON.stringify(activeP));
    
    buyerInfo.nama = activeP.nama;
    buyerInfo.nomor = activeP.nomor;
    buyerInfo.alamat = activeP.alamat;
    buyerInfo.kordinat = activeP.kordinat;
    buyerInfo.jarak = activeP.jarak;

    window.renderProfileTabs(); 
    window.updateCartProfileDisplay();

    const btn = btnEvent.target || btnEvent;
    const originalText = btn.innerHTML;
    btn.innerHTML = "✔ Berhasil Disimpan";
    btn.classList.add('bg-green-600');
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('bg-green-600');
        if(typeof window.toggleProfileModal === 'function') window.toggleProfileModal();
    }, 1000);
}

window.updateCartProfileDisplay = function() {
    let activeP = multiProfiles[activeProfileIdx];
    let defaultLabel = activeP.label || ('Alamat ' + (activeProfileIdx + 1));
    
    const displayCart = document.getElementById('displayAlamatCart');
    if (displayCart) {
        if (activeP.nama && activeP.alamat && activeP.nomor) {
            displayCart.innerHTML = `<div class="font-bold text-gray-800 text-[13px]">${activeP.nama} <span class="font-normal text-gray-500 ml-1">${activeP.nomor}</span> <span class="bg-orange-100 text-[#EE4D2D] text-[9px] px-1.5 py-0.5 rounded ml-1 border border-orange-200">${defaultLabel}</span></div><div class="text-xs text-gray-600 mt-1 line-clamp-2">${activeP.alamat}</div>`;
        } else {
            displayCart.innerHTML = `<span class="text-[#EE4D2D]">Klik di sini untuk mengisi alamat pengiriman &amp; data penerima.</span>`;
        }
    }
}

function initBuyerInfo() {
    buyerInfo = JSON.parse(localStorage.getItem('shopeefood_buyer')) || {
        nama: '', nomor: '', alamat: '', kordinat: '', jarak: 0, lastStoreConfig: ''
    };
    window.updateCartProfileDisplay();
}

function bukaProfilDariCart() {
    window.toggleCartModal(); 
    setTimeout(() => {
        window.toggleProfileModal();
    }, 350);
}


// ==========================================
// 4. LOGIKA PETA & JARAK
// ==========================================
function getUniqueStoreCoords() {
    let stores = [];
    let storeNames = [];
    cart.forEach(item => {
        if (!storeNames.includes(item.store) && item.storeLat && item.storeLng) {
            storeNames.push(item.store);
            stores.push({ lat: item.storeLat, lng: item.storeLng, name: item.store });
        }
    });
    if (stores.length === 0) {
        stores.push({ lat: -6.200000, lng: 106.816666, name: "Default Toko" }); 
    }
    return stores;
}

function hitungJarakBackground() {
    if (cart.length === 0) return;

    const stores = getUniqueStoreCoords();
    const currentStoreConfig = JSON.stringify(stores);
    let buyerLat = null, buyerLng = null;
    
    if (buyerInfo.kordinat) {
        const match = buyerInfo.kordinat.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (match) {
            buyerLat = parseFloat(match[1]);
            buyerLng = parseFloat(match[2]);
        }
    }

    if (buyerLat !== null && buyerLng !== null) {
        if (buyerInfo.lastStoreConfig === currentStoreConfig && buyerInfo.jarak > 0) {
            return; 
        }

        const router = L.Routing.osrmv1();
        let waypoints = stores.map(store => L.Routing.waypoint(L.latLng(store.lat, store.lng)));
        waypoints.push(L.Routing.waypoint(L.latLng(buyerLat, buyerLng)));

        router.route(waypoints, function(err, routes) {
            if (!err && routes && routes.length > 0) {
                const distKm = (routes[0].summary.totalDistance / 1000).toFixed(2);
                buyerInfo.jarak = distKm;
                buyerInfo.lastStoreConfig = currentStoreConfig;
                localStorage.setItem('shopeefood_buyer', JSON.stringify(buyerInfo));
                
                let w = document.getElementById('cartModalWrapper');
                if(w && !w.classList.contains('hidden')){
                    renderCartUI();
                }
            }
        });
    }
}

function initLeafletMap() {
    const stores = getUniqueStoreCoords();
    let lat = stores[0].lat + 0.01;
    let lng = stores[0].lng + 0.01;

    let kordinatEl = document.getElementById('profKordinat');
    const savedLink = kordinatEl ? kordinatEl.value : null;
    if (savedLink) {
        const match = savedLink.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
        }
    }

    let mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;

    if (!mapInitialized) {
        map = L.map('mapContainer').setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        let waypoints = stores.map(store => L.latLng(store.lat, store.lng));
        waypoints.push(L.latLng(lat, lng));

        routingControl = L.Routing.control({
            waypoints: waypoints,
            routeWhileDragging: false,
            show: false,
            createMarker: function(i, wp, nWps) {
                if (i < nWps - 1) {
                    return L.marker(wp.latLng, {draggable: false, title: "Toko"}).bindPopup(`<b>🏪 ${stores[i] ? stores[i].name : 'Titik Toko'}</b>`);
                } else {
                    return L.marker(wp.latLng, {draggable: true, title: "Tujuan"}).bindPopup("<b>📍 Lokasi Anda</b>").openPopup();
                }
            }
        }).addTo(map);

        routingControl.on('routesfound', function(e) {
            const routes = e.routes;
            const distKm = (routes[0].summary.totalDistance / 1000).toFixed(2);
            let dj = document.getElementById('displayJarak');
            if(dj) dj.innerText = distKm + " km";
            
            buyerInfo.jarak = distKm;
            buyerInfo.lastStoreConfig = JSON.stringify(stores);
            localStorage.setItem('shopeefood_buyer', JSON.stringify(buyerInfo));
            
            const wpsLength = routes[0].waypoints.length;
            const newBuyerLatLng = routes[0].waypoints[wpsLength - 1].latLng;
            updateCoordinateInput(newBuyerLatLng.lat, newBuyerLatLng.lng);
        });

        map.on('click', function(e) {
            const currentWaypoints = routingControl.getWaypoints();
            routingControl.spliceWaypoints(currentWaypoints.length - 1, 1, e.latlng);
        });

        mapInitialized = true;
    } else {
        map.invalidateSize();
        if (routingControl) {
            let waypoints = stores.map(store => L.latLng(store.lat, store.lng));
            waypoints.push(L.latLng(lat, lng));
            routingControl.setWaypoints(waypoints);
        }
        map.setView([lat, lng], 13);
    }
}

function updateCoordinateInput(lat, lng) {
    let p = document.getElementById('profKordinat');
    if(p) p.value = `https://maps.google.com/?q=${lat},${lng}`;
}

window.getLocation = function() {
    const btn = document.getElementById('btnGetLocation');
    if(!btn) return;
    btn.innerText = "⏳ Melacak...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                updateCoordinateInput(lat, lng);
                
                if(mapInitialized && routingControl) {
                    const currentWaypoints = routingControl.getWaypoints();
                    routingControl.spliceWaypoints(currentWaypoints.length - 1, 1, L.latLng(lat, lng));
                    map.setView([lat, lng], 14);
                }
                btn.innerText = "✅ Lokasi Ditemukan";
                setTimeout(()=> btn.innerText="📍 Lacak Lokasi Saya", 3000);
            },
            (err) => {
                alert("Akses GPS ditolak atau gagal. Mohon izinkan browser atau geser pin peta secara manual.");
                btn.innerText = "📍 Lacak Lokasi Saya";
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        alert("Browser Anda tidak mendukung deteksi lokasi.");
        btn.innerText = "📍 Lacak Lokasi Saya";
    }
}


// ==========================================
// 5. KERANJANG BELANJA & MODAL
// ==========================================
window.toggleProfileModal = function() {
    const wrapper = document.getElementById('profileModalWrapper');
    const modal = document.getElementById('profileModal');
    if(!wrapper || !modal) return;
    
    if (wrapper.classList.contains('hidden')) {
        initBuyerInfo();
        wrapper.classList.remove('hidden');
        wrapper.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('translate-y-full');
            setTimeout(() => { initLeafletMap(); }, 300);
        }, 10);
        document.body.style.overflow = 'hidden';
    } else {
        modal.classList.add('translate-y-full');
        setTimeout(() => {
            wrapper.classList.add('hidden');
            wrapper.classList.remove('flex');
            document.body.style.overflow = '';
        }, 300);
    }
}

window.toggleCartModal = function() {
    const wrapper = document.getElementById('cartModalWrapper');
    const modal = document.getElementById('cartModal');
    if(!wrapper || !modal) return;

    if (wrapper.classList.contains('hidden')) {
        initBuyerInfo(); 
        renderCartUI();
        wrapper.classList.remove('hidden');
        wrapper.classList.add('flex');
        setTimeout(() => modal.classList.remove('translate-y-full'), 10);
        document.body.style.overflow = 'hidden';
    } else {
        modal.classList.add('translate-y-full');
        setTimeout(() => {
            wrapper.classList.add('hidden');
            wrapper.classList.remove('flex');
            document.body.style.overflow = '';
        }, 300);
    }
}

function tambahItem(title, price, store, img, originalPrice, storeLat, storeLng) {
    let existingItem = cart.find(item => item.title === title && item.store === store);
    if (existingItem) {
        existingItem.qty += 1;
    } else {
        cart.push({ title, price, store, img, originalPrice, storeLat, storeLng, qty: 1 });
    }
    saveCart();
    hitungJarakBackground();
}

window.ubahQty = function(index, delta) {
    if(cart[index]) {
        cart[index].qty += delta;
        if(cart[index].qty <= 0) cart.splice(index, 1);
        saveCart();
        hitungJarakBackground();
        renderCartUI();
    }
}

function saveCart() {
    localStorage.setItem('shopeefood_cart', JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    badges.forEach(b => {
        b.innerText = totalItems;
        b.style.display = totalItems > 0 ? 'block' : 'none';
    });
}

window.terapkanVoucher = function() {
    const inputEl = document.getElementById('inputVoucher');
    if(!inputEl) return;
    
    const input = inputEl.value.trim().toUpperCase();
    const msgEl = document.getElementById('msgVoucher');
    
    if (!input) {
        appliedVoucher = null;
        renderCartUI();
        msgEl.innerText = "Voucher dibatalkan.";
        msgEl.className = "text-[11px] mt-1.5 text-gray-500 block";
        return;
    }

    if (VOUCHERS[input]) {
        const maxUses = VOUCHERS[input].maxUsesPerDay || 0;
        const currentUsage = getVoucherUsage(input);

        if (maxUses > 0 && currentUsage >= maxUses) {
            appliedVoucher = null;
            renderCartUI();
            msgEl.innerText = "Batas penggunaan voucher hari ini telah habis.";
            msgEl.className = "text-[11px] mt-1.5 text-[#EE4D2D] font-medium block";
            return;
        }

        appliedVoucher = { code: input, ...VOUCHERS[input] };
        renderCartUI(); 
        
        if(appliedVoucher) { 
           msgEl.innerText = `Voucher berhasil diterapkan! (Dipakai: ${currentUsage}/${maxUses})`;
           msgEl.className = "text-[11px] mt-1.5 text-green-600 font-medium block";
        }
    } else {
        appliedVoucher = null;
        renderCartUI();
        msgEl.innerText = "Voucher tidak valid atau tidak ditemukan.";
        msgEl.className = "text-[11px] mt-1.5 text-[#EE4D2D] font-medium block";
    }
}

function renderCartUI() {
    const container = document.getElementById('cartItemsContainer');
    if(!container) return;

    let subtotalOriginal = 0;
    let totalDiskon = 0;
    
    if (cart.length === 0) {
        container.innerHTML = `<div class="bg-white p-6 text-center text-gray-400 text-sm">Keranjang kosong.<br>Pilih produk terlebih dahulu.</div>`;
        document.getElementById('txtSubtotal').innerText = "Rp 0";
        document.getElementById('txtOngkir').innerText = "Rp 0";
        document.getElementById('cartJarakText').innerText = "";
        document.getElementById('txtLayanan').innerText = "Rp 0";
        document.getElementById('txtTotal').innerText = "Rp 0";
        document.getElementById('txtTotalBottom').innerText = "Rp 0";
        document.getElementById('txtDiskon').innerText = "-Rp 0";
        document.getElementById('rowMultiToko').classList.add('hidden');
        document.getElementById('rowVoucher').classList.add('hidden');
        document.getElementById('msgVoucher').classList.add('hidden');
        document.getElementById('inputVoucher').value = '';
        appliedVoucher = null;
        return;
    }

    const grouped = {};
    cart.forEach((item, i) => {
        if (!grouped[item.store]) grouped[item.store] = [];
        grouped[item.store].push({ ...item, originalIndex: i });
        
        const origPrice = item.originalPrice || item.price;
        subtotalOriginal += (origPrice * item.qty);
        if (origPrice > item.price) {
            totalDiskon += (origPrice - item.price) * item.qty;
        }
    });

    let html = '';
    for (const store in grouped) {
        html += `
        <div class="bg-white border-b border-gray-100 last:border-0 shadow-sm">
          <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
             <span class="text-sm">🏪</span>
             <span class="font-bold text-gray-800 text-[13px]">${store}</span>
             <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
          </div>
          <div class="p-4 space-y-4">
        `;
        
        grouped[store].forEach(item => {
            let imgHTML = item.img ? `<img src="${item.img}" class="w-16 h-16 object-cover rounded-sm border border-gray-100">` : `<div class="w-16 h-16 bg-gray-50 rounded-sm border border-gray-100 flex items-center justify-center text-[10px] text-gray-400">No Img</div>`;
            let originalPriceDisplay = (item.originalPrice && item.originalPrice > item.price) ? `<span class="text-[10px] text-gray-400 line-through mr-1">${formatRp(item.originalPrice)}</span>` : '';
            
            html += `
            <div class="flex gap-3">
               ${imgHTML}
               <div class="flex-grow flex flex-col justify-between">
                  <div class="text-[13px] text-gray-800 line-clamp-2 leading-tight">${item.title}</div>
                  <div class="flex items-center justify-between mt-2">
                     <div class="flex flex-col">
                         ${originalPriceDisplay}
                         <span class="text-[#EE4D2D] font-medium text-sm leading-none">${formatRp(item.price)}</span>
                     </div>
                     <div class="flex items-center border border-gray-300 rounded-sm">
                        <button onclick="ubahQty(${item.originalIndex}, -1)" class="px-2.5 py-0.5 text-gray-500 hover:bg-gray-100 font-medium">-</button>
                        <span class="px-2 text-[13px] text-gray-800 border-x border-gray-300">${item.qty}</span>
                        <button onclick="ubahQty(${item.originalIndex}, 1)" class="px-2.5 py-0.5 text-gray-500 hover:bg-gray-100 font-medium">+</button>
                     </div>
                  </div>
               </div>
            </div>`;
        });
        html += `</div></div>`;
    }

    container.innerHTML = html;
    
    const currentStoreConfig = JSON.stringify(getUniqueStoreCoords());
    if (buyerInfo.lastStoreConfig !== currentStoreConfig) {
        buyerInfo.jarak = 0; 
        hitungJarakBackground(); 
    }

    // UPDATE BIAYA MULTI TOKO SESUAI PERMINTAAN (2000 per ekstra toko)
    let numStores = Object.keys(grouped).length;
    let biayaMultiToko = numStores > 1 ? (numStores - 1) * BIAYA_MULTI_TOKO_PER_EXTRA : 0;
    
    let kalkulasiOngkir = BASE_ONGKIR; 
    let textJarak = "";
    
    if (buyerInfo.jarak && parseFloat(buyerInfo.jarak) > 0) {
        let jNum = parseFloat(buyerInfo.jarak);
        textJarak = `(${jNum} km)`;
        if (jNum > 3) {
            kalkulasiOngkir += Math.ceil(jNum - 3) * ONGKIR_PER_KM;
        }
    } else {
        if (cart.length > 0) {
            if (buyerInfo.kordinat) textJarak = `(Menghitung...)`;
            else textJarak = `(Buka Profil u/ Cek Jarak)`;
        }
    }

    let diskonVoucher = 0;
    if (appliedVoucher) {
        if (subtotalOriginal >= appliedVoucher.minPurchase) {
            if (appliedVoucher.type === 'nominal') {
                diskonVoucher = appliedVoucher.value;
            } else if (appliedVoucher.type === 'percent') {
                diskonVoucher = (subtotalOriginal * appliedVoucher.value) / 100;
                if (appliedVoucher.maxDiscount && diskonVoucher > appliedVoucher.maxDiscount) {
                    diskonVoucher = appliedVoucher.maxDiscount;
                }
            }
            if (diskonVoucher > subtotalOriginal) diskonVoucher = subtotalOriginal;
            
            document.getElementById('rowVoucher').classList.remove('hidden');
            document.getElementById('txtVoucherName').innerText = appliedVoucher.code;
            document.getElementById('txtVoucherDiscount').innerText = "-" + formatRp(diskonVoucher);
        } else {
            const msgEl = document.getElementById('msgVoucher');
            msgEl.innerText = `Minimal belanja ${formatRp(appliedVoucher.minPurchase)} untuk memakai voucher ini.`;
            msgEl.className = "text-[11px] mt-1.5 text-[#EE4D2D] font-medium block";
            appliedVoucher = null; 
            document.getElementById('rowVoucher').classList.add('hidden');
        }
    } else {
        document.getElementById('rowVoucher').classList.add('hidden');
    }

    const total = subtotalOriginal - totalDiskon + kalkulasiOngkir + BIAYA_LAYANAN + biayaMultiToko - diskonVoucher;
    
    document.getElementById('txtSubtotal').innerText = formatRp(subtotalOriginal);
    document.getElementById('cartJarakText').innerText = textJarak;
    document.getElementById('txtOngkir').innerText = formatRp(kalkulasiOngkir);
    document.getElementById('txtLayanan').innerText = formatRp(BIAYA_LAYANAN);
    document.getElementById('txtDiskon').innerText = "-" + formatRp(totalDiskon);
    
    if(biayaMultiToko > 0) {
        document.getElementById('rowMultiToko').classList.remove('hidden');
        document.getElementById('txtMultiToko').innerText = formatRp(biayaMultiToko);
    } else {
        document.getElementById('rowMultiToko').classList.add('hidden');
    }

    document.getElementById('txtTotal').innerText = formatRp(total);
    document.getElementById('txtTotalBottom').innerText = formatRp(total);
}


// ==========================================
// 6. LOGIKA QRIS & CHECKOUT
// ==========================================
function crc16(str) {
    let crc = 0xFFFF;
    for (let c = 0; c < str.length; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
            else crc = crc << 1;
        }
    }
    let hex = (crc & 0xFFFF).toString(16).toUpperCase();
    return hex.padStart(4, '0');
}

function bukaModalQRIS(nominalAkhir) {
    document.getElementById('qrisModalWrapper').classList.remove('hidden');
    document.getElementById('qrisModalWrapper').classList.add('flex');
    document.getElementById('qrisTotalText').innerText = formatRp(nominalAkhir);

    window.currentQRISNominal = nominalAkhir; // Menyimpan nominal untuk nama file unduhan

    let container = document.getElementById("qris-container");
    container.innerHTML = ""; 

    if (!STRING_QRIS_STATIS || STRING_QRIS_STATIS.length < 50) {
        container.innerHTML = '<span class="text-xs text-red-500 text-center font-medium">Error: Anda belum mengatur String QRIS pada script Anda.</span>';
        return;
    }

    try {
        let baseString = STRING_QRIS_STATIS.slice(0, -8);
        baseString = baseString.replace("010211", "010212");
        let nominalStr = nominalAkhir.toString();
        let lengthStr = nominalStr.length < 10 ? "0" + nominalStr.length : nominalStr.length.toString();
        let tagNominal = "54" + lengthStr + nominalStr;
        
        let newPayload = baseString + tagNominal + "6304";
        let newCrc = crc16(newPayload);
        let finalQrisString = newPayload + newCrc;

        new QRCode(container, {
            text: finalQrisString,
            width: 220,
            height: 220,
            colorDark : "#EE4D2D", 
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
    } catch (err) {
        container.innerHTML = '<span class="text-xs text-red-500 text-center">Gagal memproses QRIS. Pastikan string QRIS valid.</span>';
    }
}

window.downloadQRIS = function() {
    let container = document.getElementById("qris-container");
    if (!container) return;

    let canvas = container.querySelector("canvas");
    let img = container.querySelector("img");
    let url = "";

    // Pustaka qrcode.js biasanya merender canvas atau tag image base64
    if (img && img.src && img.src.startsWith("data:image")) {
        url = img.src;
    } else if (canvas) {
        url = canvas.toDataURL("image/png");
    } else {
        alert("QRIS belum dimuat sepenuhnya. Silakan tunggu sebentar.");
        return;
    }

    // Penamaan file yang dinamis dengan jumlah tagihan
    let nominal = window.currentQRISNominal || "0";
    let filename = "QRIS_Anturun_Rp" + nominal + ".png";

    // Konversi base64 ke blob agar lebih didukung di browser HP/Mobile
    fetch(url)
        .then(res => res.blob())
        .then(blob => {
            let blobUrl = window.URL.createObjectURL(blob);
            let a = document.createElement("a");
            a.style.display = "none";
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);
            }, 100);
        })
        .catch(err => {
            console.error("Gagal mendownload QRIS:", err);
            // Fallback cara standar jika fetch gagal
            let a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
}

window.tutupModalQRIS = function() {
    document.getElementById('qrisModalWrapper').classList.add('hidden');
    document.getElementById('qrisModalWrapper').classList.remove('flex');
}

window.lanjutWAPascaQRIS = function() {
    window.tutupModalQRIS();
    eksekusiKirimWA(); 
}

window.prosesCheckout = function() {
    if (cart.length === 0) return alert("Keranjang kosong!");

    const nama = buyerInfo.nama;
    const nomor = buyerInfo.nomor;
    const alamat = buyerInfo.alamat;
    const kordinat = buyerInfo.kordinat || "Tidak disertakan";
    const jarak = buyerInfo.jarak || "Tidak dihitung";
    const catatan = document.getElementById('waCatatan').value.trim() || "-";
    
    const metodeEl = document.querySelector('input[name="metode"]:checked');
    const metode = metodeEl ? metodeEl.value : "COD";

    if (!nama || !nomor || !alamat) {
        bukaProfilDariCart();
        return alert("Mohon lengkapi Data Penerima terlebih dahulu.");
    }

    let subtotalOriginal = 0;
    let totalDiskon = 0;
    const grouped = {};
    
    cart.forEach((item) => {
        if (!grouped[item.store]) grouped[item.store] = [];
        grouped[item.store].push(item);
        const origPrice = item.originalPrice || item.price;
        subtotalOriginal += origPrice * item.qty;
        if (origPrice > item.price) {
            totalDiskon += (origPrice - item.price) * item.qty;
        }
    });

    // UPDATE BIAYA MULTI TOKO SESUAI PERMINTAAN (2000 per ekstra toko)
    let numStores = Object.keys(grouped).length;
    let biayaMultiToko = numStores > 1 ? (numStores - 1) * BIAYA_MULTI_TOKO_PER_EXTRA : 0;
    
    let finalOngkir = BASE_ONGKIR; 

    let jNum = parseFloat(jarak);
    if (jNum && jNum > 3) {
        finalOngkir += Math.ceil(jNum - 3) * ONGKIR_PER_KM; 
    }

    let diskonVoucher = 0;
    if (appliedVoucher && subtotalOriginal >= appliedVoucher.minPurchase) {
        if (appliedVoucher.type === 'nominal') {
            diskonVoucher = appliedVoucher.value;
        } else if (appliedVoucher.type === 'percent') {
            diskonVoucher = (subtotalOriginal * appliedVoucher.value) / 100;
            if (appliedVoucher.maxDiscount && diskonVoucher > appliedVoucher.maxDiscount) {
                diskonVoucher = appliedVoucher.maxDiscount;
            }
        }
        if(diskonVoucher > subtotalOriginal) diskonVoucher = subtotalOriginal;
    }

    const total = subtotalOriginal - totalDiskon + finalOngkir + BIAYA_LAYANAN + biayaMultiToko - diskonVoucher;

    pendingCheckoutData = {
        orderNo: "ORD" + Date.now().toString().slice(-6) + Math.floor(Math.random()*10),
        nama, nomor, alamat, kordinat, jarak, catatan, metode,
        subtotalOriginal, totalDiskon, finalOngkir, biayaMultiToko, diskonVoucher, total, grouped
    };

    if (metode === "QRIS") {
        bukaModalQRIS(total);
    } else {
        eksekusiKirimWA();
    }
}

function eksekusiKirimWA() {
    if (!pendingCheckoutData) return;

    let d = pendingCheckoutData; 

    let textWA = `*🧾 PESANAN BARU (ANTURUN)*\n`;
    textWA += `*No. Resi:* ${d.orderNo}\n\n`;

    textWA += `*👤 INFO PENERIMA:*\n`;
    textWA += `Nama: ${d.nama}\n`;
    textWA += `No. HP: ${d.nomor}\n`;
    textWA += `Alamat: ${d.alamat}\n`;
    textWA += `Kordinat: ${d.kordinat}\n`;
    textWA += `📍 *Total Jarak Antar:* ${d.jarak} KM\n\n`;
    
    textWA += `*🛒 RINCIAN PESANAN:*\n`;
    
    for (const store in d.grouped) {
        textWA += `🏪 *${store}*\n`;
        d.grouped[store].forEach(item => {
            textWA += `🔹 ${item.qty}x ${item.title} - ${formatRp(item.price)}\n`;
        });
        textWA += `\n`;
    }

    textWA += `*📝 CATATAN PEMBELI:*\n${d.catatan}\n\n`;

    textWA += `*💳 PEMBAYARAN (${d.metode}):*\n`;
    textWA += `Subtotal Produk: ${formatRp(d.subtotalOriginal)}\n`;
    textWA += `Pengiriman (${d.jarak} KM): ${formatRp(d.finalOngkir)}\n`;
    textWA += `Biaya Layanan: ${formatRp(BIAYA_LAYANAN)}\n`;
    
    if(d.biayaMultiToko > 0) textWA += `Biaya Beda Toko: ${formatRp(d.biayaMultiToko)}\n`;
    if(d.totalDiskon > 0) textWA += `Promo Coret: -${formatRp(d.totalDiskon)}\n`;
    if(d.diskonVoucher > 0) textWA += `Diskon Voucher [${appliedVoucher.code}]: -${formatRp(d.diskonVoucher)}\n`;
    
    textWA += `---------------------------------\n`;
    textWA += `*TOTAL TAGIHAN: ${formatRp(d.total)}*\n\n`;
    
    if (d.metode === "QRIS") {
        textWA += `_SAYA SUDAH MEMBAYAR VIA QRIS. Berikut saya lampirkan bukti transfernya. Tolong segera diproses!_`;
    } else {
        textWA += `_Mohon konfirmasi jika pesanan sudah diterima kurir. Terima kasih!_`;
    }

    const waLink = `https://wa.me/${NOMOR_WA_ADMIN}?text=${encodeURIComponent(textWA)}`;
    
    if (d.diskonVoucher > 0 && appliedVoucher) {
        incrementVoucherUsage(appliedVoucher.code);
    }

    cart = [];
    saveCart();
    renderCartUI();
    
    document.getElementById('cartModalWrapper').classList.add('hidden');
    document.body.style.overflow = '';
    pendingCheckoutData = null;

    window.open(waLink, '_blank');
}
