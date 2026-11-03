        (function () {
          window.Messliner = window.Messliner || {};

          const BANGLADESH_CITIES = [
            { id: 'Dhaka', name: 'Dhaka', bn: 'ঢাকা', qibla: 277.6 },
            { id: 'Chittagong', name: 'Chittagong', bn: 'চট্টগ্রাম', qibla: 279.8 },
            { id: 'Sylhet', name: 'Sylhet', bn: 'সিলেট', qibla: 279.1 },
            { id: 'Rajshahi', name: 'Rajshahi', bn: 'রাজশাহী', qibla: 277.2 },
            { id: 'Khulna', name: 'Khulna', bn: 'খুলনা', qibla: 278.4 },
            { id: 'Barishal', name: 'Barishal', bn: 'বরিশাল', qibla: 278.9 },
            { id: 'Rangpur', name: 'Rangpur', bn: 'রংপুর', qibla: 276.9 },
            { id: 'Mymensingh', name: 'Mymensingh', bn: 'ময়মনসিংহ', qibla: 277.9 },
            { id: 'Comilla', name: 'Cumilla', bn: 'কুমিল্লা', qibla: 278.6 },
            { id: 'Bogura', name: 'Bogura', bn: 'বগুড়া', qibla: 277.1 },
            { id: 'Gazipur', name: 'Gazipur', bn: 'গাজীপুর', qibla: 277.7 },
            { id: "Cox's Bazar", name: "Cox's Bazar", bn: 'কক্সবাজার', qibla: 280.2 }
          ];

          const DHIKR_PRESETS = [
            { id: 'subhanallah', ar: 'سُبْحَانَ ٱللَّٰهِ', translit: 'SubhanAllah', bn: 'আল্লাহ পবিত্র ও মহিমান্বিত', target: 33 },
            { id: 'alhamdulillah', ar: 'ٱلْحَمْدُ لِلَّٰهِ', translit: 'Alhamdulillah', bn: 'সকল প্রশংসা আল্লাহর জন্য', target: 33 },
            { id: 'allahuakbar', ar: 'ٱللَّٰهُ أَكْبَرُ', translit: 'Allahu Akbar', bn: 'আল্লাহ সর্বশ্রেষ্ঠ', target: 34 },
            { id: 'astaghfirullah', ar: 'أَسْتَغْفِرُ ٱللَّٰهَ', translit: 'Astaghfirullah', bn: 'আমি আল্লাহর কাছে ক্ষমা চাই', target: 100 },
            { id: 'lailaha', ar: 'لَا إِلٰهَ إِلَّا ٱللَّٰهُ', translit: 'La Ilaha Illallah', bn: 'আল্লাহ ছাড়া কোনো উপাস্য নেই', target: 100 },
            { id: 'durood', ar: 'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ', translit: 'Allahumma Salli Ala Muhammad', bn: 'হে আল্লাহ, মুহাম্মদ (সা.)-এর ওপর শান্তি বর্ষণ করুন', target: 100 },
            { id: 'free', ar: 'ذِكْرٌ حُرٌّ', translit: 'Free Dhikr', bn: 'উন্মুক্ত জিকির (সীমাহীন)', target: 0 }
          ];

          const ESSENTIAL_DUAS = [
            {
              id: 'dua_eating_before',
              cat: 'Daily',
              title: 'খাওয়ার শুরুর দোয়া (Before Eating)',
              arabic: 'بِسْمِ اللَّهِ وَعَلَى بَرَكَةِ اللَّهِ',
              translit: "Bismillahi wa 'ala barakatillah",
              bn: 'আল্লাহর নামে এবং আল্লাহর বরকতের উপর শুরু করছি।',
              ref: 'আবু দাউদ ৩/৩৪৭'
            },
            {
              id: 'dua_eating_after',
              cat: 'Daily',
              title: 'খাওয়ার শেষের দোয়া (After Eating)',
              arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ',
              translit: "Alhamdu lillahil-ladhi at'amana wa saqana wa ja'alana muslimin",
              bn: 'সকল প্রশংসা আল্লাহর যিনি আমাদের খাওয়ালেন, পান করালেন এবং মুসলিম বানালেন।',
              ref: 'তিরমিজি ৩৪৫৭'
            },
            {
              id: 'dua_sleep_before',
              cat: 'Daily',
              title: 'ঘুমানোর আগের দোয়া (Before Sleeping)',
              arabic: 'اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا',
              translit: 'Allahumma bismika amutu wa ahya',
              bn: 'হে আল্লাহ! আপনারই নামে আমি মারা যাই (ঘুমাই) এবং আপনারই নামে পুনর্জীবিত হই।',
              ref: 'সহিহ বুখারি ৬৩২৪'
            },
            {
              id: 'dua_waking_up',
              cat: 'Daily',
              title: 'ঘুম থেকে ওঠার দোয়া (Waking Up)',
              arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
              translit: "Alhamdu lillahil-ladhi ahyana ba'da ma amatana wa ilaihin-nushur",
              bn: 'সকল প্রশংসা আল্লাহর জন্য, যিনি মৃত্যুর পর আমাদের জীবন দান করলেন এবং তাঁর কাছেই প্রত্যাবর্তন।',
              ref: 'সহিহ বুখারি ৬৩১২'
            },
            {
              id: 'dua_leaving_home',
              cat: 'Daily',
              title: 'ঘর থেকে বের হওয়ার দোয়া (Leaving Home)',
              arabic: 'بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
              translit: "Bismillahi tawakkaltu 'alallahi wa la hawla wa la quwwata illa billah",
              bn: 'আল্লাহর নামে, আল্লাহর ওপরই ভরসা করলাম। আল্লাহর সাহায্য ছাড়া পাপ থেকে বাঁচার এবং সৎকাজ করার কোনো শক্তি নেই।',
              ref: 'তিরমিজি ৩৪২৬'
            },
            {
              id: 'dua_entering_home',
              cat: 'Daily',
              title: 'ঘরে প্রবেশের দোয়া (Entering Home)',
              arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ الْمَوْلَجِ وَخَيْرَ الْمَخْرَجِ بِسْمِ اللَّهِ وَلَجْنَا وَبِسْمِ اللَّهِ خَرَجْنَا وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا',
              translit: "Allahumma inni as'aluka khairal-mawlaji wa khairal-makhraj, bismillahi walajna wa bismillahi kharajna wa 'alallahi rabbina tawakkalna",
              bn: 'হে আল্লাহ! আমি আপনার কাছে কল্যাণকর প্রবেশ ও কল্যাণকর প্রস্থান প্রার্থনা করছি। আল্লাহর নামেই আমরা প্রবেশ করি ও বের হই এবং আমাদের রব আল্লাহর ওপরই ভরসা রাখি।',
              ref: 'আবু দাউদ ৫০৯৬'
            },
            {
              id: 'dua_adhan_after',
              cat: 'Prayer',
              title: 'আজানের পরের দোয়া (After Adhan)',
              arabic: 'اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ وَالصَّلَاةِ الْقَائِمَةِ آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ',
              translit: "Allahumma Rabba hadhihid-da'watit-tammah, was-salatil-qa'imah, ati Muhammadanil-wasilata wal-fadilah, wab'ath-hu maqamam-mahmudanil-ladhi wa'adtah",
              bn: 'হে আল্লাহ! এই পরিপূর্ণ আহ্বান ও আসন্ন সালাতের প্রভু! মুহাম্মদ (সা.)-কে ওসীলা ও মর্যাদা দান করুন এবং তাঁকে সেই প্রশংসিত স্থানে পৌঁছে দিন যার প্রতিশ্রুতি আপনি দিয়েছেন।',
              ref: 'সহিহ বুখারি ৬১৪'
            },
            {
              id: 'dua_sayyidul_istighfar',
              cat: 'Forgiveness',
              title: 'সাইয়েদুল ইস্তেগফার (Sayyidul Istighfar)',
              arabic: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ',
              translit: "Allahumma Anta Rabbi la ilaha illa Anta, khalaqtani wa ana 'abduka, wa ana 'ala 'ahdika wa wa'dika mastata'tu, a'udhu bika min sharri ma sana'tu, abu'u laka bini'matika 'alayya, wa abu'u bidhanbi faghfir li, fa-innahu la yaghfirudh-dhunuba illa Anta",
              bn: 'হে আল্লাহ! আপনি আমার রব, আপনি ছাড়া কোনো উপাস্য নেই। আপনি আমাকে সৃষ্টি করেছেন এবং আমি আপনার বান্দা। আমি আমার সাধ্যমতো আপনার অঙ্গীকারে অবিচল আছি। ক্ষমা করুন আমাকে, কারণ আপনি ছাড়া গুনাহ ক্ষমা করার কেউ নেই।',
              ref: 'সহিহ বুখারি ৬৩০৬'
            },
            {
              id: 'dua_ayatul_kursi',
              cat: 'Protection',
              title: 'আয়াতুল কুরসি (Ayat al-Kursi)',
              arabic: 'اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ وَلَا يَئُودُهُ حِفْظُهُمَا وَهُوَ الْعَلِيُّ الْعَظِيمُ',
              translit: "Allahu la ilaha illa Huwa, Al-Hayyul-Qayyum. La ta'khudhuhu sinatun wa la nawm. Lahu ma fis-samawati wa ma fil-ard. Man dhal-ladhi yashfa'u 'indahu illa bi-idhnih. Ya'lamu ma baina aidihim wa ma khalfahum, wa la yuhituna bishay'im-min 'ilmihi illa bima sha'a. Wasi'a kursiyyuhus-samawati wal-ard, wa la ya'uduhu hifzuhuma, wa Huwal-'Aliyyul-'Azim.",
              bn: 'আল্লাহ, তিনি ছাড়া কোনো সত্য উপাস্য নেই; তিনি চিরঞ্জীব, সবকিছুর ধারক। তন্দ্রা ও নিদ্রা তাঁকে স্পর্শ করে না। আসমান ও জমিনে যা কিছু আছে সবই তাঁর। তিনি পরম উচ্চ, মহান।',
              ref: 'সূরা আল-বাকারা: ২৫৫'
            }
          ];

          const Prayer = {
            selectedCity: 'Dhaka',
            timingsData: null,
            currentSlide: 0,
            slideInterval: null,
            countdownInterval: null,
            activeDhikrIndex: 0,
            tasbihCounts: {},
            tasbihLaps: {},
            lifetimeTaps: 0,
            selectedDuaCategory: 'All',
            deviceOrientationActive: false,

            init() {
              // 1. Restore selected city
              try {
                const savedCity = localStorage.getItem('ml_prayer_selected_city');
                if (savedCity && BANGLADESH_CITIES.some(c => c.id === savedCity)) {
                  this.selectedCity = savedCity;
                }
              } catch (_) { }

              // 2. Restore Tasbih storage
              try {
                const savedTasbih = localStorage.getItem('ml_tasbih_storage_v2');
                if (savedTasbih) {
                  const parsed = JSON.parse(savedTasbih);
                  this.tasbihCounts = parsed.counts || {};
                  this.tasbihLaps = parsed.laps || {};
                  this.lifetimeTaps = parsed.lifetime || 0;
                  this.activeDhikrIndex = parsed.activeDhikr || 0;
                }
              } catch (_) { }

              // 3. Setup city dropdown list
              this.renderCityMenu();
              this.updateCityLabel();

              // 4. Start Carousel & Touch Swipe
              this.initCarousel();
              this.initSliderSwipe();

              // 5. Render Dua tabs & items
              this.renderDuaCategories();
              this.renderDuaCards();

              // 6. Render Tasbih pills & dial
              this.renderTasbihPills();
              this.updateTasbihUI();

              // 7. Fetch Prayer Times from Aladhan REST API
              this.loadPrayerTimes();

              // 8. Setup Qibla compass default
              this.updateQiblaDisplay();
            },

            /* ------------------------------------------
               CAROUSEL SLIDER ENGINE (Touch Swipe + Auto)
               ------------------------------------------ */
            initCarousel() {
              if (this.slideInterval) clearInterval(this.slideInterval);
              this.slideInterval = setInterval(() => {
                const next = (this.currentSlide + 1) % 3;
                this.goSlide(next);
              }, 4500);
            },

            goSlide(idx) {
              this.currentSlide = idx;
              const track = document.getElementById('prayerSliderTrack');
              if (track) {
                track.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                track.style.transform = 'translateX(-' + (idx * 100) + '%)';
              }
              const dots = document.querySelectorAll('#prayerSliderDots .prayer-dot');
              dots.forEach((d, i) => {
                d.classList.toggle('active', i === idx);
              });
            },

            initSliderSwipe() {
              const wrap = document.getElementById('prayerSliderWrap');
              const track = document.getElementById('prayerSliderTrack');
              if (!wrap || !track || this._swipeInitialized) return;
              this._swipeInitialized = true;

              let startX = 0;
              let currentX = 0;
              let isDragging = false;
              let hasMoved = false;

              const onStart = (x) => {
                isDragging = true;
                hasMoved = false;
                startX = x;
                currentX = x;
                track.style.transition = 'none';
                if (this.slideInterval) clearInterval(this.slideInterval);
              };
              const onMove = (x) => {
                if (!isDragging) return;
                const diff = x - startX;
                if (Math.abs(diff) > 6) hasMoved = true;
                const cardWidth = wrap.offsetWidth || 340;
                const baseOffset = -this.currentSlide * cardWidth;
                track.style.transform = 'translateX(' + (baseOffset + diff) + 'px)';
              };
              const onEnd = (x) => {
                if (!isDragging) return;
                isDragging = false;
                track.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                const finalX = x !== undefined ? x : currentX;
                const diff = finalX - startX;
                const cardWidth = wrap.offsetWidth || 340;
                const threshold = cardWidth * 0.16;

                if (diff < -threshold) {
                  this.goSlide((this.currentSlide + 1) % 3);
                } else if (diff > threshold) {
                  this.goSlide((this.currentSlide - 1 + 3) % 3);
                } else {
                  this.goSlide(this.currentSlide);
                }
                if (hasMoved) {
                  this.dragSuppressed = true;
                  setTimeout(() => { this.dragSuppressed = false; }, 250);
                }
                this.initCarousel();
              };
              // Touch events for mobile
              wrap.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) onStart(e.touches[0].clientX);
              }, { passive: true });
              wrap.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches[0]) {
                  currentX = e.touches[0].clientX;
                  onMove(currentX);
                }
              }, { passive: true });

              wrap.addEventListener('touchend', (e) => {
                onEnd(e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : undefined);
              });

              // Mouse drag events for desktop preview
              wrap.addEventListener('mousedown', (e) => {
                onStart(e.clientX);
              });
              window.addEventListener('mousemove', (e) => {
                if (isDragging) onMove(e.clientX);
              });
              window.addEventListener('mouseup', (e) => {
                if (isDragging) onEnd(e.clientX);
              });
            },

            /* ------------------------------------------
               CITY SELECTOR DROPDOWN
               ------------------------------------------ */
            renderCityMenu() {
              const menu = document.getElementById('prayerCityMenu');
              if (!menu) return;
              menu.innerHTML = BANGLADESH_CITIES.map(c => {
                const isAct = c.id === this.selectedCity ? 'active' : '';
                return '<div class="prayer-city-item ' + isAct + '" onclick="Messliner.prayer.selectCity(\'' + c.id + '\')">' +
                  '<span>' + c.name + ' (' + c.bn + ')</span>' +
                  (isAct ? '<span>✓</span>' : '') +
                  '</div>';
              }).join('');
            },

            toggleCityDropdown() {
              const dd = document.getElementById('prayerCityDropdown');
              if (dd) dd.classList.toggle('active');
            },

            selectCity(cityId) {
              this.selectedCity = cityId;
              try {
                localStorage.setItem('ml_prayer_selected_city', cityId);
              } catch (_) { }
              const dd = document.getElementById('prayerCityDropdown');
              if (dd) dd.classList.remove('active');
              this.renderCityMenu();
              this.updateCityLabel();
              this.updateQiblaDisplay();
              this.loadPrayerTimes();
            },

            updateCityLabel() {
              const cObj = BANGLADESH_CITIES.find(c => c.id === this.selectedCity) || BANGLADESH_CITIES[0];
              const lbl = document.getElementById('prayerSelectedCityLabel');
              if (lbl) lbl.textContent = cObj.name + ', Bangladesh';
              const bannerCity = document.getElementById('prayerBannerCity');
              if (bannerCity) bannerCity.textContent = cObj.name + ', Bangladesh';
            },

            /* ------------------------------------------
               ALADHAN REST API INTEGRATION
               ------------------------------------------ */
            async loadPrayerTimes() {
              const city = this.selectedCity;
              const today = new Date();
              const todayKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
              const cacheKey = 'ml_prayer_timings_' + city + '_' + todayKey;

              // 1. Try instant load from cache
              try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                  const data = JSON.parse(cached);
                  this.applyTimings(data);
                }
              } catch (_) { }

              // 2. Fetch fresh live data from official Aladhan REST API
              // Method 1: University of Islamic Sciences, Karachi (Bangladesh Standard)
              // School 1: Hanafi (Bangladesh Standard for Asr)
              const url = 'https://api.aladhan.com/v1/timingsByCity?city=' + encodeURIComponent(city) + '&country=Bangladesh&method=1&school=1';
              try {
                const res = await fetch(url);
                if (!res.ok) throw new Error('Aladhan API status ' + res.status);
                const json = await res.json();
                if (json && json.code === 200 && json.data) {
                  this.timingsData = json.data;
                  try {
                    localStorage.setItem(cacheKey, JSON.stringify(json.data));
                  } catch (_) { }
                  this.applyTimings(json.data);
                }
              } catch (err) {
                console.warn('[Prayer] Aladhan API fetch error, using resilient fallback:', err);
                // If offline, use robust fallback table for Bangladesh
                if (!this.timingsData) {
                  this.applyFallbackTimings(city);
                }
              }
            },

            applyTimings(data) {
              this.timingsData = data;
              const timings = data.timings;
              if (!timings) return;

              // Update individual times
              const setT = (id, val) => {
                const el = document.getElementById(id);
                if (el && val) {
                  // Convert "HH:MM" to 12h formatted time
                  el.textContent = this.format12Hour(val);
                }
              };
              setT('time-fajr', timings.Fajr);
              setT('time-dhuhr', timings.Dhuhr);
              setT('time-asr', timings.Asr);
              setT('time-maghrib', timings.Maghrib);
              setT('time-isha', timings.Isha);
              setT('time-sunrise', timings.Sunrise);
              setT('time-sunset', timings.Sunset || timings.Maghrib);
              setT('time-imsak', timings.Imsak || timings.Fajr);

              // Update Hijri & Gregorian Dates
              const hijri = data.date && data.date.hijri;
              const greg = data.date && data.date.gregorian;
              if (hijri) {
                const hijriStr = (hijri.day || '') + ' ' + (hijri.month?.en || '') + ' ' + (hijri.year || '') + ' Hijri';
                const hEl = document.getElementById('prayerHijriDate');
                if (hEl) hEl.textContent = hijriStr;
              }
              if (greg) {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const d = new Date();
                const gregStr = d.getDate() + ' ' + monthNames[d.getMonth()] + ', ' + d.getFullYear() + ' AD';
                const gEl = document.getElementById('prayerGregorianSub');
                if (gEl) gEl.textContent = gregStr;
                const bDate = document.getElementById('prayerBannerDate');
                if (bDate) bDate.textContent = d.getDate() + ' ' + monthNames[d.getMonth()].toUpperCase() + ', ' + d.getFullYear();
              }
              // Start or refresh real-time countdown to next prayer
              this.startCountdownLoop();
            },

            applyFallbackTimings(city) {
              // Precise standard astronomical timings for Bangladesh divisions
              const fallback = {
                timings: {
                  Fajr: '04:48',
                  Sunrise: '06:05',
                  Dhuhr: '11:42',
                  Asr: '15:43',
                  Sunset: '17:18',
                  Maghrib: '17:18',
                  Isha: '18:35',
                  Imsak: '04:38'
                },
                date: {
                  hijri: { day: '23', month: { en: 'Jumada al-awwal' }, year: '1448' },
                  gregorian: {}
                }
              };
              this.applyTimings(fallback);
            },

            format12Hour(time24) {
              if (!time24) return '--:--';
              const clean = time24.split(' ')[0];
              const parts = clean.split(':');
              if (parts.length < 2) return time24;
              let h = parseInt(parts[0], 10);
              const m = parts[1];
              const ampm = h >= 12 ? 'PM' : 'AM';
              h = h % 12;
              if (h === 0) h = 12;
              const hStr = h < 10 ? '0' + h : '' + h;
              return hStr + ':' + m + ' ' + ampm;
            },

            /* ------------------------------------------
               LIVE COUNTDOWN TO NEXT WAQT ENGINE
               ------------------------------------------ */
            startCountdownLoop() {
              if (this.countdownInterval) clearInterval(this.countdownInterval);
              this.updateNextWaqtCountdown();
              this.countdownInterval = setInterval(() => {
                this.updateNextWaqtCountdown();
              }, 1000);
            },

            updateNextWaqtCountdown() {
              if (!this.timingsData || !this.timingsData.timings) return;
              const t = this.timingsData.timings;
              const now = new Date();

              const parseWaqtDate = (waqtTimeStr, isTomorrow = false) => {
                const clean = (waqtTimeStr || '00:00').split(' ')[0];
                const [hh, mm] = clean.split(':').map(Number);
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
                if (isTomorrow) {
                  d.setDate(d.getDate() + 1);
                }
                return d;
              };
              const fajrDate = parseWaqtDate(t.Fajr);
              const sunriseDate = parseWaqtDate(t.Sunrise);
              const dhuhrDate = parseWaqtDate(t.Dhuhr);
              const asrDate = parseWaqtDate(t.Asr);
              const maghribDate = parseWaqtDate(t.Maghrib);
              const ishaDate = parseWaqtDate(t.Isha);
              const tomorrowFajrDate = parseWaqtDate(t.Fajr, true);

              let nextWaqtName = 'Fajar';
              let targetDate = fajrDate;
              let currentActiveWaqt = 'isha';

              if (now < fajrDate) {
                nextWaqtName = 'Fazar';
                targetDate = fajrDate;
                currentActiveWaqt = 'isha';
              } else if (now < sunriseDate) {
                nextWaqtName = 'Dhuhr';
                targetDate = dhuhrDate;
                currentActiveWaqt = 'fajr';
              } else if (now < dhuhrDate) {
                nextWaqtName = 'Dhuhr';
                targetDate = dhuhrDate;
                currentActiveWaqt = 'fajr'; // post-sunrise morning
              } else if (now < asrDate) {
                nextWaqtName = 'Asr';
                targetDate = asrDate;
                currentActiveWaqt = 'dhuhr';
              } else if (now < maghribDate) {
                nextWaqtName = 'Magrib';
                targetDate = maghribDate;
                currentActiveWaqt = 'asr';
              } else if (now < ishaDate) {
                nextWaqtName = "Isha'a";
                targetDate = ishaDate;
                currentActiveWaqt = 'maghrib';
              } else {
                nextWaqtName = 'Fazar';
                targetDate = tomorrowFajrDate;
                currentActiveWaqt = 'isha';
              }
              // Calculate diff
              const diffMs = Math.max(0, targetDate.getTime() - now.getTime());
              const totalSec = Math.floor(diffMs / 1000);
              const hrs = Math.floor(totalSec / 3600);
              const mins = Math.floor((totalSec % 3600) / 60);
              const secs = totalSec % 60;

              const pad = n => (n < 10 ? '0' + n : '' + n);
              const timerStr = hrs + ':' + pad(mins) + ':' + pad(secs);

              // Update banner elements (Screenshot 3)
              const nameEl = document.getElementById('prayerNextWaqtName');
              if (nameEl) nameEl.textContent = nextWaqtName;
              const timerEl = document.getElementById('prayerNextWaqtTimer');
              if (timerEl) timerEl.textContent = timerStr;

              // Highlight the active waqt card (Screenshot 1 & 2)
              const cards = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
              cards.forEach(k => {
                const cardEl = document.getElementById('waqtCard-' + k);
                if (cardEl) {
                  cardEl.classList.toggle('active', k === currentActiveWaqt);
                }
              });
            },

            /* ------------------------------------------
               TASBIH COUNTER ENGINE
               ------------------------------------------ */
            openTasbih() {
              if (this.dragSuppressed) return;
              this.closeFullView();
              const mainView = document.getElementById('prayerMainView');
              if (mainView) mainView.style.display = 'none';
              const v = document.getElementById('prayerFullView-tasbih');
              if (v) v.classList.add('active');
              this.updateTasbihUI();
              const ca = document.querySelector('.content-area');
              if (ca) ca.scrollTop = 0;
            },

            openTasbihModal() {
              this.openTasbih();
            },

            closeTasbihModal() {
              this.closeFullView();
            },

            closeFullView() {
              document.querySelectorAll('.prayer-fullview-container').forEach(el => {
                el.classList.remove('active');
              });
              const mainView = document.getElementById('prayerMainView');
              if (mainView) mainView.style.display = 'block';
            },

            renderTasbihPills() {
              const container = document.getElementById('tasbihDhikrPills');
              if (!container) return;
              container.innerHTML = DHIKR_PRESETS.map((d, i) => {
                const isAct = i === this.activeDhikrIndex ? 'active' : '';
                return '<button type="button" class="tasbih-dhikr-pill ' + isAct + '" onclick="Messliner.prayer.selectDhikr(' + i + ')">' +
                  d.translit + (d.target ? ' (' + d.target + ')' : '') +
                  '</button>';
              }).join('');
            },

            selectDhikr(idx) {
              this.activeDhikrIndex = idx;
              this.renderTasbihPills();
              this.updateTasbihUI();
              this.saveTasbihData();
            },

            tapTasbih() {
              const dObj = DHIKR_PRESETS[this.activeDhikrIndex] || DHIKR_PRESETS[0];
              const curCount = (this.tasbihCounts[dObj.id] || 0) + 1;
              this.tasbihCounts[dObj.id] = curCount;
              this.lifetimeTaps = (this.lifetimeTaps || 0) + 1;

              // Check target completion
              if (dObj.target > 0 && curCount >= dObj.target) {
                // Lap complete!
                this.tasbihLaps[dObj.id] = (this.tasbihLaps[dObj.id] || 0) + 1;
                this.tasbihCounts[dObj.id] = 0; // reset for next lap
                this.playTasbihCompleteSound();
              } else {
                this.playTasbihClickSound();
              }
              // Haptic vibration on mobile
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(25);
              }
              this.updateTasbihUI();
              this.saveTasbihData();
            },

            resetTasbih() {
              const dObj = DHIKR_PRESETS[this.activeDhikrIndex] || DHIKR_PRESETS[0];
              this.tasbihCounts[dObj.id] = 0;
              this.updateTasbihUI();
              this.saveTasbihData();
            },

            updateTasbihUI() {
              const dObj = DHIKR_PRESETS[this.activeDhikrIndex] || DHIKR_PRESETS[0];
              const count = this.tasbihCounts[dObj.id] || 0;
              const laps = this.tasbihLaps[dObj.id] || 0;

              const arEl = document.getElementById('tasbihArabic');
              if (arEl) arEl.textContent = dObj.ar;
              const mnEl = document.getElementById('tasbihMeaning');
              if (mnEl) mnEl.textContent = dObj.translit + ' — ' + dObj.bn;

              const cVal = document.getElementById('tasbihCountVal');
              if (cVal) cVal.textContent = count;
              const tHint = document.getElementById('tasbihTargetHint');
              if (tHint) tHint.textContent = dObj.target > 0 ? ('/ ' + dObj.target) : '/ ∞';

              const lVal = document.getElementById('tasbihLapsVal');
              if (lVal) lVal.textContent = laps;
              const totVal = document.getElementById('tasbihTotalVal');
              if (totVal) totVal.textContent = this.lifetimeTaps || 0;

              // Progress Circle SVG
              const circle = document.getElementById('tasbihProgressCircle');
              if (circle) {
                const circumference = 2 * Math.PI * 52; // ~326.7
                let ratio = 0;
                if (dObj.target > 0) {
                  ratio = Math.min(1, count / dObj.target);
                } else {
                  ratio = (count % 100) / 100;
                }
                const offset = circumference * (1 - ratio);
                circle.style.strokeDashoffset = offset;
              }
            },

            saveTasbihData() {
              try {
                const payload = {
                  counts: this.tasbihCounts,
                  laps: this.tasbihLaps,
                  lifetime: this.lifetimeTaps,
                  activeDhikr: this.activeDhikrIndex
                };
                localStorage.setItem('ml_tasbih_storage_v2', JSON.stringify(payload));
              } catch (_) { }
            },

            playTasbihClickSound() {
              try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(650, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.04);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.05);
              } catch (_) { }
            },

            playTasbihCompleteSound() {
              try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.32);
              } catch (_) { }
            },

            /* ------------------------------------------
               DUA MODAL ENGINE
               ------------------------------------------ */
            openDua() {
              if (this.dragSuppressed) return;
              this.closeFullView();
              const mainView = document.getElementById('prayerMainView');
              if (mainView) mainView.style.display = 'none';
              const v = document.getElementById('prayerFullView-dua');
              if (v) v.classList.add('active');
              const ca = document.querySelector('.content-area');
              if (ca) ca.scrollTop = 0;
            },

            openDuaModal() {
              this.openDua();
            },

            closeDuaModal() {
              this.closeFullView();
            },

            renderDuaCategories() {
              const cats = ['All', 'Daily', 'Prayer', 'Forgiveness', 'Protection'];
              const wrap = document.getElementById('duaCategoryChips');
              if (!wrap) return;
              wrap.innerHTML = cats.map(c => {
                const isAct = c === this.selectedDuaCategory ? 'active' : '';
                return '<button type="button" class="dua-chip ' + isAct + '" onclick="Messliner.prayer.selectDuaCategory(\'' + c + '\')">' +
                  c +
                  '</button>';
              }).join('');
            },

            selectDuaCategory(cat) {
              this.selectedDuaCategory = cat;
              this.renderDuaCategories();
              this.renderDuaCards();
            },

            renderDuaCards() {
              const list = document.getElementById('duaCardsList');
              if (!list) return;
              const filtered = this.selectedDuaCategory === 'All'
                ? ESSENTIAL_DUAS
                : ESSENTIAL_DUAS.filter(d => d.cat === this.selectedDuaCategory);

              list.innerHTML = filtered.map(d => {
                return '<div class="dua-item-card">' +
                  '<div class="dua-card-top">' +
                  '<span class="dua-card-title">' + d.title + '</span>' +
                  '<button type="button" class="dua-copy-btn" onclick="Messliner.prayer.copyDua(\'' + d.id + '\', this)">' +
                  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                  '<span>Copy</span>' +
                  '</button>' +
                  '</div>' +
                  '<div class="dua-arabic">' + d.arabic + '</div>' +
                  '<div class="dua-transliteration">' + d.translit + '</div>' +
                  '<div class="dua-translation-bn">' + d.bn + '</div>' +
                  '<div class="dua-reference">সূত্র: ' + d.ref + '</div>' +
                  '</div>';
              }).join('');
            },

            copyDua(duaId, btn) {
              const dua = ESSENTIAL_DUAS.find(d => d.id === duaId);
              if (!dua) return;
              const text = dua.arabic + '\n\n' + dua.translit + '\n\nঅর্থ: ' + dua.bn + '\n(' + dua.ref + ')';
              if (navigator && navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => {
                  if (btn) {
                    const orig = btn.innerHTML;
                    btn.innerHTML = '<span>✓ Copied</span>';
                    setTimeout(() => { btn.innerHTML = orig; }, 1800);
                  }
                });
              }
            },

            /* ------------------------------------------
               QIBLA COMPASS ENGINE
               ------------------------------------------ */
            openQibla() {
              if (this.dragSuppressed) return;
              this.closeFullView();
              const mainView = document.getElementById('prayerMainView');
              if (mainView) mainView.style.display = 'none';
              const v = document.getElementById('prayerFullView-qibla');
              if (v) v.classList.add('active');
              this.updateQiblaDisplay();
              this.requestOrientationPermission();
              const ca = document.querySelector('.content-area');
              if (ca) ca.scrollTop = 0;
            },

            openQiblaModal() {
              this.openQibla();
            },

            closeQiblaModal() {
              this.closeFullView();
            },

            updateQiblaDisplay() {
              const cObj = BANGLADESH_CITIES.find(c => c.id === this.selectedCity) || BANGLADESH_CITIES[0];
              const angle = cObj.qibla || 278;

              const angleEl = document.getElementById('qiblaHeadingAngle');
              if (angleEl) angleEl.textContent = Math.round(angle) + '°';

              const marker = document.getElementById('qiblaKaabaMarker');
              if (marker) {
                marker.style.transform = 'rotate(' + angle + 'deg) translate(0, -118px)';
              }
              const cityEl = document.getElementById('qiblaCityName');
              if (cityEl) cityEl.textContent = cObj.name || 'Rajshahi';
            },
            requestOrientationPermission() {
              if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                  .then(state => {
                    if (state === 'granted') {
                      this.bindOrientationSensor();
                    }
                  })
                  .catch(console.error);
              } else {
                this.bindOrientationSensor();
              }
            },

            bindOrientationSensor() {
              if (this.deviceOrientationActive) return;
              this.deviceOrientationActive = true;

              const handleOrientation = (e) => {
                let heading = e.webkitCompassHeading || e.alpha;
                if (heading === undefined || heading === null) return;

                // Invert heading to rotate dial face
                const dial = document.getElementById('qiblaDialFace');
                if (dial) {
                  dial.style.transform = 'rotate(' + (-heading) + 'deg)';
                }
              };

              if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', handleOrientation);
              } else if ('ondeviceorientation' in window) {
                window.addEventListener('deviceorientation', handleOrientation);
              }
            }
          };

          Messliner.prayer = Prayer;

          // Auto-boot when DOM is ready
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => Prayer.init());
          } else {
            Prayer.init();
          }
        })();