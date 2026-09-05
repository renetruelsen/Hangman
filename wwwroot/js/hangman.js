/* ============================================================
   Galgeleg — spillogik
   ============================================================ */
(function () {
    'use strict';

    /* Fysisk dansk QWERTY-tastaturlayout (øverste bogstavrække, hjemrække,
       nederste række) i stedet for alfabetisk rækkefølge — så det on-screen
       tastatur kan læres blindt af alle der kender et rigtigt tastatur. */
    const ALPHABET = ['QWERTYUIOPÅ', 'ASDFGHJKLÆØ', 'ZXCVBNM'];
    const LETTER = /^[A-ZÆØÅ]$/;
    const MAX_MISSES = 8;

    /* Hvert forkert gæt afslører ét trin. Øjnene tegnes som fire streger på én gang. */
    const STAGES = [[0], [1], [2], [3], [4], [5], [6, 7, 8, 9], [10]];

    const HEART_SVG =
        '<svg class="heart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21z"/></svg>';

    const FALLBACK = { word: 'SOMMERFUGL', category: 'Dyr' };

    const el = {
        wrap: document.getElementById('wrap'),
        stars: document.getElementById('stars'),
        vignette: document.getElementById('vignette'),
        flash: document.getElementById('flash'),
        hearts: document.getElementById('hearts'),
        category: document.getElementById('category'),
        remaining: document.getElementById('remaining'),
        word: document.getElementById('word'),
        missList: document.getElementById('missList'),
        keyboard: document.getElementById('keyboard'),
        hint: document.getElementById('hint'),
        body: document.getElementById('body'),
        overlay: document.getElementById('overlay'),
        result: document.getElementById('result'),
        resultTitle: document.getElementById('resultTitle'),
        resultText: document.getElementById('resultText'),
        newGame: document.getElementById('newGame'),
        playAgain: document.getElementById('playAgain'),
        confetti: document.getElementById('confetti'),
        srStatus: document.getElementById('srStatus'),
        streak: document.getElementById('streak'),
        streakCount: document.getElementById('streakCount'),
        mute: document.getElementById('mute')
    };

    const frameParts = Array.from(document.querySelectorAll('.gallows [data-frame]'));
    const bodyParts = Array.from(document.querySelectorAll('.gallows [data-part]'));

    const state = {
        word: '',
        category: '',
        guessed: new Set(),
        misses: 0,
        /* over = runden er afgjort. Sættes i samme øjeblik udfaldet er kendt,
           ikke først når resultatskærmen vises — ellers kan man nå at gætte
           videre i de sekunder animationerne kører. */
        over: false,
        busy: false,
        previous: null,
        streak: 0,
        /* Løbenummer for den aktuelle runde. win()/lose() planlægges via
           setTimeout op til ~1300ms efter udfaldet er kendt — når "Nyt ord"
           eller Enter/Escape starter en ny runde inden da, ville den gamle
           win()/lose() ellers fyre oven i den nye og afsløre dens bogstaver. */
        round: 0
    };

    /* ---------- lyd ---------- */

    const sound = (function () {
        let ctx = null;
        let muted = false;

        try {
            muted = window.localStorage.getItem('galgeleg.muted') === '1';
        } catch (err) {
            muted = false;
        }

        function context() {
            if (!ctx) {
                const Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor) {
                    return null;
                }
                ctx = new Ctor();
            }
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            return ctx;
        }

        function tone(freq, start, duration, type, gain) {
            const audio = context();
            if (!audio) {
                return;
            }
            const osc = audio.createOscillator();
            const vol = audio.createGain();
            const at = audio.currentTime + start;

            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, at);
            vol.gain.setValueAtTime(0, at);
            vol.gain.linearRampToValueAtTime(gain || .18, at + .012);
            vol.gain.exponentialRampToValueAtTime(.0001, at + duration);

            osc.connect(vol);
            vol.connect(audio.destination);
            osc.start(at);
            osc.stop(at + duration + .02);
        }

        function slide(from, to, start, duration, type, gain) {
            const audio = context();
            if (!audio) {
                return;
            }
            const osc = audio.createOscillator();
            const vol = audio.createGain();
            const at = audio.currentTime + start;

            osc.type = type || 'sawtooth';
            osc.frequency.setValueAtTime(from, at);
            osc.frequency.exponentialRampToValueAtTime(to, at + duration);
            vol.gain.setValueAtTime(gain || .16, at);
            vol.gain.exponentialRampToValueAtTime(.0001, at + duration);

            osc.connect(vol);
            vol.connect(audio.destination);
            osc.start(at);
            osc.stop(at + duration + .02);
        }

        const api = {
            get muted() {
                return muted;
            },
            toggle: function () {
                muted = !muted;
                try {
                    window.localStorage.setItem('galgeleg.muted', muted ? '1' : '0');
                } catch (err) {
                    /* privat browsing — lyden holder bare denne session */
                }
                return muted;
            },
            hit: function () {
                if (muted) { return; }
                tone(660, 0, .12, 'sine', .16);
                tone(880, .07, .16, 'sine', .13);
            },
            miss: function () {
                if (muted) { return; }
                slide(190, 70, 0, .28, 'sawtooth', .14);
            },
            win: function () {
                if (muted) { return; }
                [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
                    tone(f, i * .1, .34, 'triangle', .17);
                });
            },
            lose: function () {
                if (muted) { return; }
                slide(320, 60, 0, 1.1, 'sawtooth', .17);
            }
        };

        return api;
    })();

    function syncMuteButton() {
        el.mute.setAttribute('aria-pressed', sound.muted ? 'true' : 'false');
    }

    /* ---------- stjerner ---------- */

    (function sprinkleStars() {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 80; i++) {
            const s = document.createElement('div');
            s.className = 'star';
            s.style.left = (Math.random() * 100) + '%';
            s.style.top = (Math.random() * 72) + '%';
            s.style.animationDelay = (Math.random() * 4) + 's';
            s.style.opacity = (Math.random() * .6 + .15).toFixed(2);
            frag.appendChild(s);
        }
        el.stars.appendChild(frag);
    })();

    /* ---------- tegne-animation ----------
       pathLength-attributten er upålidelig på tværs af browsere, så
       længderne måles direkte og sættes som dasharray/dashoffset. */

    function lengthOf(node) {
        return node.getTotalLength ? node.getTotalLength() : 0;
    }

    function prime(node) {
        const len = lengthOf(node);
        node.style.transition = 'none';
        node.style.strokeDasharray = len;
        node.style.strokeDashoffset = len;
        void node.getBoundingClientRect();
        node.style.transition = '';
    }

    function draw(node) {
        void node.getBoundingClientRect();
        node.style.strokeDashoffset = '0';

        /* Når stregen er tegnet færdig fjernes dash-mønsteret igen. Bliver det
           stående sammen med drop-shadow, undlader Chrome at gentegne strøget
           og stregen ender som løsrevne prikker. */
        const settle = function () {
            node.style.strokeDasharray = 'none';
        };
        node.addEventListener('transitionend', settle, { once: true });
        setTimeout(settle, 900);
    }

    function hide(node) {
        const len = lengthOf(node);
        node.style.strokeDasharray = len;
        void node.getBoundingClientRect();
        node.style.strokeDashoffset = len;
    }

    /* ---------- opbygning ---------- */

    function announce(text) {
        el.srStatus.textContent = text;
    }

    function maskedWord() {
        return Array.from(state.word).map(function (ch) {
            return state.guessed.has(ch) ? ch : '_';
        }).join(' ');
    }

    /* Tæller uafslørede FELTER, ikke unikke bogstaver — ellers kan man aflæse
       hvor mange dubletter ordet har, før man har gættet noget. */
    function lettersLeft() {
        return Array.from(state.word).filter(function (ch) {
            return !state.guessed.has(ch);
        }).length;
    }

    /* Flash og overlay-hul skal centreres om ordet — det flytter sig både med
       ordlængde og viewport, så positionen kan ikke hardcodes. */
    function aimAtWord() {
        const box = el.word.getBoundingClientRect();
        const x = (100 * (box.left + box.width / 2) / window.innerWidth).toFixed(1) + "%";
        const y = (100 * (box.top + box.height / 2) / window.innerHeight).toFixed(1) + "%";
        [el.overlay, el.flash].forEach(function (node) {
            node.style.setProperty("--hx", x);
            node.style.setProperty("--hy", y);
        });
    }

    function renderRemaining() {
        const left = lettersLeft();
        el.remaining.innerHTML = left
            ? '<b>' + left + '</b> ' + (left === 1 ? 'bogstav tilbage' : 'bogstaver tilbage')
            : '';
    }

    function renderHearts() {
        el.hearts.innerHTML = HEART_SVG.repeat(MAX_MISSES);
        el.hearts.setAttribute('aria-label', MAX_MISSES + ' liv tilbage');
    }

    function renderWord() {
        el.word.style.setProperty('--n', state.word.length);
        /* Bogstavet skrives først ind når det afsløres — ellers ligger hele
           ordet i klartekst i DOM'en fra start. */
        el.word.innerHTML = Array.from(state.word).map(function () {
            return '<div class="tile"><span class="glyph"></span></div>';
        }).join('');
    }

    function renderKeyboard() {
        el.keyboard.innerHTML = ALPHABET.map(function (row) {
            return '<div class="kb-row">' + Array.from(row).map(function (ch) {
                return '<button type="button" class="key" data-key="' + ch + '">' + ch + '</button>';
            }).join('') + '</div>';
        }).join('');
    }

    function renderMisses() {
        const wrong = Array.from(state.guessed).filter(function (ch) {
            return state.word.indexOf(ch) === -1;
        });
        el.missList.innerHTML = wrong.length
            ? wrong.map(function (ch) { return '<span class="miss-chip">' + ch + '</span>'; }).join('')
            : '<span class="misses-empty">ingen endnu</span>';
    }

    function buildGallows() {
        frameParts.forEach(function (p, i) {
            prime(p);
            setTimeout(function () { draw(p); }, 140 + i * 190);
        });
    }

    function setTension() {
        document.documentElement.style.setProperty('--tension', (state.misses / MAX_MISSES).toFixed(3));
    }

    function renderStreak() {
        el.streak.hidden = state.streak < 2;
        el.streakCount.textContent = state.streak;
    }

    /* ---------- spilstart ---------- */

    async function fetchWord() {
        /* Serveren holder selv styr på hvilke ord denne browser har haft (via
           en cookie), så klienten behøver ikke sende noget med. */
        const query = '';
        try {
            /* Uden timeout hænger et svarløst /api/word for evigt: try/catch
               fanger kun et rigtigt HTTP-fejlsvar eller en JSON-parse-fejl,
               aldrig et promise der bare aldrig resolver. state.busy ville så
               blive stående som true, og siden loader newGame() automatisk
               ved opstart — så uden dette er en hængende server en helt
               blank, uspilbar side uden fejlbesked. */
            const res = await fetch('/api/word' + query, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            const data = await res.json();
            if (!data || typeof data.word !== 'string' || !data.word) {
                throw new Error('Uventet svar fra /api/word');
            }
            return data;
        } catch (err) {
            console.warn('Kunne ikke hente ord, bruger reserveord.', err);
            return FALLBACK;
        }
    }

    async function newGame() {
        if (state.busy) {
            return;
        }
        state.busy = true;
        state.round++;   /* gør enhver allerede planlagt win()/lose() fra forrige runde stale */

        const picked = await fetchWord();

        state.word = picked.word.toUpperCase();
        state.category = picked.category || '—';
        state.previous = state.word;
        state.guessed = new Set();
        state.misses = 0;
        state.over = false;

        el.category.textContent = state.category;
        el.overlay.classList.remove('show');
        el.wrap.classList.remove('finished');
        el.wrap.inert = false;
        el.body.classList.remove('sway', 'drop'); /* SVG-elementers className er read-only */
        bodyParts.forEach(prime);

        clearConfetti();
        setTension();
        el.hint.classList.remove('faded');
        renderHearts();
        renderWord();
        renderRemaining();
        renderKeyboard();
        renderMisses();
        renderStreak();
        buildGallows();
        announce('Nyt ord. Kategori ' + state.category + '. ' + state.word.length + ' bogstaver.');

        state.busy = false;
    }

    /* ---------- gæt ---------- */

    function guess(letter) {
        if (state.over || state.busy || !LETTER.test(letter) || state.guessed.has(letter)) {
            return;
        }
        state.guessed.add(letter);
        el.hint.classList.add('faded');

        const key = el.keyboard.querySelector('.key[data-key="' + letter + '"]');
        if (key) {
            key.disabled = true;
        }

        if (state.word.indexOf(letter) !== -1) {
            if (key) {
                key.classList.add('hit');
            }
            sound.hit();
            revealLetter(letter);
        } else {
            if (key) {
                key.classList.add('miss');
            }
            sound.miss();
            registerMiss(letter);
        }
    }

    function pulse(color) {
        el.vignette.style.boxShadow = 'inset 0 0 150px ' + color;
        setTimeout(function () { el.vignette.style.boxShadow = ''; }, 340);
    }

    function revealLetter(letter) {
        const tiles = el.word.children;
        let step = 0;
        Array.from(state.word).forEach(function (ch, i) {
            if (ch === letter) {
                const tile = tiles[i];
                setTimeout(function () {
                    tile.querySelector('.glyph').textContent = ch;
                    tile.classList.add('filled');
                }, step * 110);
                step++;
            }
        });

        pulse('rgba(61, 220, 151, .38)');
        renderRemaining();

        const won = Array.from(state.word).every(function (ch) { return state.guessed.has(ch); });
        if (won) {
            state.over = true;   /* låses med det samme, ikke først i win() */
            const round = state.round;
            setTimeout(function () { win(round); }, 380 + step * 110);
            announce('Rigtigt: ' + letter + '. Ordet var ' + state.word + '. Løst.');
        } else {
            announce('Rigtigt: ' + letter + '. ' + maskedWord() + '. ' + lettersLeft() + ' bogstaver tilbage.');
        }
    }

    function registerMiss(letter) {
        STAGES[state.misses].forEach(function (index) {
            draw(bodyParts[index]);
        });
        state.misses++;

        renderMisses();
        setTension();

        const hearts = el.hearts.querySelectorAll('.heart');
        if (hearts[MAX_MISSES - state.misses]) {
            hearts[MAX_MISSES - state.misses].classList.add('gone');
        }
        el.hearts.setAttribute('aria-label', (MAX_MISSES - state.misses) + ' liv tilbage');

        /* Klassen SKAL af igen: en resterende transform gør .wrap til en
           stacking context, og så kan .panel ikke løftes over overlayet. */
        el.wrap.classList.remove('shake');
        void el.wrap.offsetWidth;
        el.wrap.classList.add('shake');
        setTimeout(function () { el.wrap.classList.remove('shake'); }, 500);
        pulse('rgba(255, 93, 115, .55)');

        if (state.misses >= MAX_MISSES) {
            state.over = true;   /* låses med det samme, ikke først i lose() */
            announce('Forkert: ' + letter + '. Ingen liv tilbage.');
            const round = state.round;
            setTimeout(function () { lose(round); }, 450);
        } else {
            announce('Forkert: ' + letter + '. ' + (MAX_MISSES - state.misses) + ' liv tilbage.');
            if (state.misses >= 6) {
                el.body.classList.add('sway');
            }
        }
    }

    /* ---------- afslutning ---------- */

    function win(round) {
        if (round !== state.round) {
            return;   /* en ny runde er startet imens — denne sejr er stale */
        }
        const perfect = state.misses === 0;

        el.wrap.classList.add('finished');
        hide(frameParts[4]);                 /* rebet knækker */
        if (!perfect) {
            el.body.classList.add('drop');   /* der er kun en krop at tabe hvis han var tegnet */
        }

        state.streak++;
        renderStreak();

        aimAtWord();
        el.flash.classList.remove('fire');
        void el.flash.offsetWidth;
        el.flash.classList.add('fire');
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            confetti();
        }
        sound.win();

        setTimeout(function () {
            showResult(
                'win',
                perfect ? 'FEJLFRIT' : 'FRI!',
                perfect ? 'Ikke ét forkert gæt.' : 'Du nåede at skære ham ned.'
            );
        }, 900);
    }

    function lose(round) {
        if (round !== state.round) {
            return;   /* en ny runde er startet imens — dette nederlag er stale */
        }
        el.wrap.classList.add('finished');
        el.body.classList.add('sway');
        sound.lose();

        /* Bogstaverne falder på plads ét ad gangen — pausen får noget at lave. */
        const tiles = Array.from(el.word.children);
        let step = 0;
        tiles.forEach(function (tile, i) {
            if (!tile.classList.contains('filled')) {
                setTimeout(function () {
                    tile.querySelector('.glyph').textContent = state.word[i];
                    tile.classList.add('revealed');
                }, step * 70);
                step++;
            }
        });

        state.streak = 0;
        renderStreak();
        el.remaining.textContent = '';   /* ordet står afsløret — tælleren giver ikke mening længere */
        announce('Tabt. Ordet var ' + state.word + '.');

        /* Ordet står allerede afsløret i fuld størrelse bag kortet — at gentage
           det her ville bare tage plads fra knappen. */
        setTimeout(function () {
            showResult('lose', 'FOR SENT', 'Otte forkerte gæt.');
        }, 800 + step * 70);
    }

    function showResult(kind, title, html) {
        aimAtWord();
        el.result.className = 'result ' + kind;
        el.resultTitle.textContent = title;
        el.resultText.innerHTML = html || '';
        el.overlay.classList.add('show');
        el.wrap.inert = true;   /* fokus må ikke vandre ned i tastaturet bagved */
        el.playAgain.focus();
    }

    /* ---------- konfetti ---------- */

    const ctx = el.confetti.getContext('2d');
    let pieces = [];

    function sizeCanvas() {
        el.confetti.width = window.innerWidth;
        el.confetti.height = window.innerHeight;
    }

    function clearConfetti() {
        pieces = [];
        ctx.clearRect(0, 0, el.confetti.width, el.confetti.height);
    }

    function confetti() {
        const colors = ['#3ddc97', '#f5c451', '#7c8cff', '#ff5d73', '#ffffff'];
        const box = el.word.getBoundingClientRect();

        pieces = Array.from({ length: 120 }, function () {
            return {
                x: box.left + Math.random() * box.width,
                y: box.bottom - Math.random() * box.height * .4,
                vx: (Math.random() - .5) * 22,
                vy: -(Math.random() * 16 + 8),
                size: Math.random() * 10 + 8,
                color: colors[Math.floor(Math.random() * colors.length)],
                round: Math.random() < .5,
                rot: Math.random() * 6,
                spin: (Math.random() - .5) * .3
            };
        });
        requestAnimationFrame(tick);
    }

    function tick() {
        ctx.clearRect(0, 0, el.confetti.width, el.confetti.height);
        pieces.forEach(function (p) {
            p.vy += .42;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.spin;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            if (p.round) {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .6);
            }
            ctx.restore();
        });
        pieces = pieces.filter(function (p) { return p.y < el.confetti.height + 60; });
        if (pieces.length) {
            requestAnimationFrame(tick);
        } else {
            ctx.clearRect(0, 0, el.confetti.width, el.confetti.height);
        }
    }

    /* ---------- input ---------- */

    el.keyboard.addEventListener('click', function (e) {
        const key = e.target.closest('.key');
        if (key) {
            guess(key.dataset.key);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }
        if ((e.key === 'Enter' || e.key === 'Escape') && state.over) {
            e.preventDefault();
            newGame();
            return;
        }
        const ch = e.key.toUpperCase();
        if (LETTER.test(ch)) {
            guess(ch);
        }
    });

    el.newGame.addEventListener('click', newGame);
    el.playAgain.addEventListener('click', newGame);
    el.mute.addEventListener('click', function () {
        sound.toggle();
        syncMuteButton();
        if (!sound.muted) {
            sound.hit();
        }
    });
    window.addEventListener('resize', sizeCanvas);

    syncMuteButton();
    sizeCanvas();
    newGame();
})();
