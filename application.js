(() => {
    const { Engine, Composite, Bodies, Body, Constraint, Query, Sleeping, Vertices, Vector } = Matter;

    const MIN_ROCKS = 14;
    const MAX_ROCKS = 46;
    const CAP_ROCKS = 90; // including the ones poured in by typing a secret word
    const HOME = ['камень', 'Belarusian'];
    const ALWAYS = [HOME, ['stone', 'English']];
    const ENGRAVED = [
        ['камінь', 'Ukrainian'],
        ['kamień', 'Polish'],
        ['kámen', 'Czech'],
        ['kameň', 'Slovak'],
        ['камък', 'Bulgarian'],
        ['камен', 'Serbian'],
        ['kamen', 'Slovenian'],
    ];
    const HINT_BURIED = 'Someone is buried here. Throw some rocks.';
    const HINT_FOUND = 'There I am! Tap me to hear about the rocks.';
    const HINT_FLYING = 'Free at last!';
    const HINT_CAP = 'Hold on to your cap!';
    const HINT_STORK = 'A stork lives under the cap. In Belarusian it is “бусел”.';
    const HINT_TILT = 'Now tilt the phone. Or turn it upside down.';
    const HINT_NO_TILT = 'No motion access, so the rocks stay put.';
    const HINT_FUSE = 'Fire in the hole!';
    const HINT_GOLD = 'You found the golden rock. One visit in twenty has it.';
    const SECRET_WORDS = ['rock', 'камень', 'kamen', 'kamień'];
    const GOLD_CHANCE = 1 / 20;
    const BOOM_WORD = 'BOOM!';

    // Hue and saturation of the granite; lightness comes from the light direction.
    const GRANITES = ['225 7%', '32 7%', '205 10%', '270 5%'];
    const GOLD = '43 88%';
    const INK = '#211c24';
    const RED = '#e2302b';
    const PAPER = '#fff';
    const LIGHT = Vector.normalise({ x: -0.45, y: -0.9 });

    const STEP = 1000 / 60;
    const MAX_SPEED = 45;
    const GATHER_MS = 650;
    const FUSE_MS = 2600;
    const BLAST_MS = 1000;
    const COLLIDE_ALL = 0xffffffff;
    const NARROW = 700; // too little room to put rocks aside
    const EDGE = 48;
    const TAP_MS = 300;
    const TAP_SLOP = 8;
    const WALL = 400;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const stage = document.getElementById('stage');
    const avatar = document.getElementById('avatar');
    const story = document.getElementById('story');
    const hint = document.getElementById('hint');
    const gatherButton = document.getElementById('gather');
    const dynamiteButton = document.getElementById('dynamite');
    const tiltButton = document.getElementById('tilt');
    const ctx = stage.getContext('2d');

    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    const grabs = new Map(); // pointerId -> { constraint, rock, start, moved }
    const hasGold = location.hash === '#gold' || Math.random() < GOLD_CHANCE;
    let rocks = [];
    let blownAway = []; // rocks that left the screen after an explosion
    let dynamite = null; // { body, fuse }
    let blast = null; // { x, y, age, spikes }
    let debris = [];
    let bounds = [];
    let ceiling = null; // only there while the phone is upside down
    let width = 0;
    let height = 0;
    let builtFor = 0; // avatar height the current rocks were made for
    let gathering = null;
    let found = false;
    let landing = true; // rocks are still falling, too early to say who is buried
    let dug = false; // the visitor has moved rocks since they last fell
    let flown = false;
    let flights = 0;
    let frame = 0;
    let lastTime = 0;
    let backlog = 0;

    const random = (min, max) => min + Math.random() * (max - min);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    function shuffle(list) {
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    /* ---------- Building the scene ---------- */

    function outline(radiusX, radiusY, corners) {
        const points = [];
        for (let i = 0; i < corners; i++) {
            const angle = ((i + random(-0.32, 0.32)) / corners) * Math.PI * 2;
            const reach = random(0.82, 1.1);
            points.push({ x: Math.cos(angle) * radiusX * reach, y: Math.sin(angle) * radiusY * reach });
        }
        return Vertices.hull(points);
    }

    function createRock(points, look) {
        const rock = Bodies.fromVertices(0, 0, [points], {
            friction: 0.7,
            frictionStatic: 1.1,
            frictionAir: 0.012,
            restitution: 0.08,
            density: 0.002,
            sleepThreshold: 45,
        });

        // Remember the shape unrotated so it can be drawn with facets that catch the light.
        const local = rock.vertices.map((v) => Vector.sub(v, rock.position));
        rock.look = {
            ...look,
            local,
            face: local.map((v) => Vector.mult(v, random(...look.inset))),
            granite: GRANITES[Math.floor(Math.random() * GRANITES.length)],
            tone: random(-5, 5),
        };
        return rock;
    }

    function createPlainRock(unit) {
        const size = unit * random(0.6, 1.35);
        const points = outline(size * random(1, 1.3), size, Math.round(random(6, 9)));
        return createRock(points, { inset: [0.4, 0.78] });
    }

    function createRocks() {
        const unit = avatar.offsetHeight * 0.17;
        // Enough to cover the avatar, without burying the text on a narrow screen.
        const total = clamp(Math.round((width / avatar.offsetHeight) * 9.5), MIN_ROCKS, MAX_ROCKS);
        const words = [...ALWAYS, ...shuffle(ENGRAVED).slice(0, Math.round(total / 4) - ALWAYS.length)];
        const plain = Array.from({ length: total - words.length }, () => createPlainRock(unit));
        const engraved = words.map(([word, language]) => {
            const halfWidth = unit * (0.75 + word.length * 0.2);
            const rock = createRock(outline(halfWidth, unit * 0.95, 10), { inset: [0.8, 0.86], word, language });
            rock.look.fontSize = unit * 0.5;
            return rock;
        });

        const all = shuffle([...plain, ...engraved]);
        if (hasGold) {
            const gold = plain.reduce((biggest, rock) => (rock.area > biggest.area ? rock : biggest));
            Object.assign(gold.look, { granite: GOLD, tone: 0, gold: true });
            // Last in the list means drawn on top.
            all.push(...all.splice(all.indexOf(gold), 1));
        }
        return all;
    }

    // A narrow column above the avatar, so that the falling rocks form a heap on it.
    function columnSpot(index, bottom) {
        const size = avatar.offsetHeight;
        const perRow = 4;
        const rowsUp = Math.floor(index / perRow);
        const side = (index % perRow) - (perRow - 1) / 2;
        return { x: width / 2 + side * size * 0.42, y: bottom - rowsUp * size * 0.42 };
    }

    function buildBounds() {
        Composite.remove(engine.world, bounds);
        const solid = { isStatic: true, friction: 1, frictionStatic: 2 };
        const tall = height * 4 + WALL * 2;
        const wallY = height + WALL - tall / 2;
        bounds = [
            Bodies.rectangle(width / 2, height + WALL / 2, width + WALL * 2, WALL, solid),
            Bodies.rectangle(-WALL / 2, wallY, WALL, tall, solid),
            Bodies.rectangle(width + WALL / 2, wallY, WALL, tall, solid),
        ];
        Composite.add(engine.world, bounds);
        if (ceiling) {
            Composite.remove(engine.world, ceiling);
            ceiling = null;
            hangCeiling();
        }
    }

    function hangCeiling() {
        const needed = engine.gravity.y < 0;
        if (needed && !ceiling) {
            ceiling = Bodies.rectangle(width / 2, -WALL / 2, width + WALL * 2, WALL, { isStatic: true, friction: 1 });
            Composite.add(engine.world, ceiling);
        } else if (!needed && ceiling) {
            Composite.remove(engine.world, ceiling);
            ceiling = null;
        }
    }

    function resize() {
        const box = stage.getBoundingClientRect();
        if (box.width === width && box.height === height) return;

        const shiftX = (box.width - width) / 2;
        const shiftY = box.height - height;
        width = box.width;
        height = box.height;

        const ratio = Math.min(devicePixelRatio || 1, 2);
        stage.width = Math.round(width * ratio);
        stage.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        buildBounds();
        // After rotating a phone the rocks no longer fit the new scene.
        const outgrown = Math.abs(shiftX * 2) > width * 0.25 || Math.abs(avatar.offsetHeight / builtFor - 1) > 0.15;
        if (rocks.length && outgrown) {
            build();
            return;
        }
        for (const rock of rocks) {
            Body.translate(rock, { x: shiftX, y: shiftY });
            keepInside(rock);
        }
        wake();
    }

    function build() {
        grabs.forEach((_, id) => release(id));
        gathering = null;
        if (dynamite) Composite.remove(engine.world, dynamite.body);
        dynamite = null;
        blownAway = [];
        Composite.remove(engine.world, rocks);
        builtFor = avatar.offsetHeight;
        rocks = createRocks();
        Composite.add(engine.world, rocks);
        drop(-avatar.offsetHeight * 0.3);
    }

    function keepInside(rock) {
        const x = clamp(rock.position.x, 30, Math.max(30, width - 30));
        const y = clamp(rock.position.y, ceiling ? 10 : -Infinity, height - 10);
        if (x !== rock.position.x || y !== rock.position.y) Body.setPosition(rock, { x, y });
    }

    /* ---------- Simulation ---------- */

    function wake() {
        for (const rock of rocks) Sleeping.set(rock, false);
        if (dynamite) Sleeping.set(dynamite.body, false);
        if (!frame) {
            lastTime = 0;
            frame = requestAnimationFrame(tick);
        }
    }

    function step() {
        Engine.update(engine, STEP);
        for (const body of things()) {
            if (body.speed > MAX_SPEED) {
                Body.setVelocity(body, Vector.mult(Vector.normalise(body.velocity), MAX_SPEED));
            }
            const { x, y } = body.position;
            if (body.flung) {
                if (x < -200 || x > width + 200 || y < -200 || y > height + 200) blowAway(body);
            } else if (x < 0 || x > width || y > height || (ceiling && y < 0)) {
                keepInside(body);
            }
        }

        stepEffects();
        if (dynamite) {
            dynamite.fuse -= STEP;
            if (dynamite.fuse <= 0) explode();
        }
    }

    const things = () => (dynamite ? [...rocks, dynamite.body] : rocks);

    function tick(time) {
        frame = 0;
        backlog += lastTime ? Math.min(time - lastTime, 50) : STEP;
        lastTime = time;

        if (gathering) moveGathering(time);
        for (; backlog >= STEP; backlog -= STEP) {
            if (!gathering) step();
        }

        draw();
        if (!gathering) checkFound();

        const busy = gathering || grabs.size > 0 || dynamite || blast || debris.length > 0
            || rocks.some((rock) => !rock.isSleeping);
        if (busy) frame = requestAnimationFrame(tick);
    }

    function settle() {
        for (let i = 0; i < 600 && rocks.some((rock) => !rock.isSleeping); i++) step();
        for (const rock of rocks) Sleeping.set(rock, true);
        draw();
        checkFound();
    }

    function drop(bottom) {
        dug = false;
        landing = true;
        rocks.forEach((rock, i) => {
            Body.setPosition(rock, columnSpot(i, bottom));
            Body.setVelocity(rock, { x: 0, y: 0 });
            Body.setAngularVelocity(rock, random(-0.04, 0.04));
        });
        wake();
        if (reducedMotion.matches) settle();
    }

    /* ---------- Gathering stones ---------- */

    function gather() {
        if (gathering) return;
        grabs.forEach((_, id) => release(id));
        hint.textContent = HINT_BURIED;
        found = false;
        flown = false;
        dug = false;
        landing = true;
        callBack();
        if (reducedMotion.matches) {
            drop(height - avatar.offsetHeight);
            return;
        }

        const bottom = height - avatar.offsetHeight * 0.3;
        const byHeight = [...rocks].sort((a, b) => b.position.y - a.position.y);
        gathering = {
            start: 0,
            moves: byHeight.map((rock, i) => ({ rock, from: { ...rock.position }, to: columnSpot(i, bottom) })),
        };
        wake();
    }

    // Returns the rocks that an explosion threw off the screen.
    function callBack() {
        for (const rock of rocks) {
            rock.flung = false;
            rock.collisionFilter.mask = COLLIDE_ALL;
        }
        for (const rock of blownAway) {
            Body.setPosition(rock, { x: Math.random() < 0.5 ? -100 : width + 100, y: random(0, height) });
            Composite.add(engine.world, rock);
        }
        // Golden rock stays last, on top of the others.
        rocks = [...rocks, ...blownAway].sort((a, b) => Boolean(a.look.gold) - Boolean(b.look.gold));
        blownAway = [];
    }

    function moveGathering(time) {
        gathering.start ||= time;
        const progress = Math.min((time - gathering.start) / GATHER_MS, 1);
        const eased = 1 - (1 - progress) ** 3;
        for (const { rock, from, to } of gathering.moves) {
            Body.setPosition(rock, { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased });
            Body.rotate(rock, 0.06 * (1 - progress) * Math.sign(to.x - from.x));
        }
        if (progress === 1) {
            for (const { rock } of gathering.moves) {
                Body.setVelocity(rock, { x: 0, y: 0 });
                Body.setAngularVelocity(rock, 0);
            }
            gathering = null;
        }
    }

    /* ---------- Dynamite ---------- */

    function throwDynamite() {
        if (dynamite || blast || gathering) return;
        const size = avatar.offsetHeight * 0.36;
        if (reducedMotion.matches) {
            explode({ x: width / 2, y: height - avatar.offsetHeight / 2 });
            return;
        }

        const body = Bodies.rectangle(width / 2 + random(-20, 20), -size, size * 1.1, size * 0.8, {
            friction: 0.7,
            frictionAir: 0.012,
            restitution: 0.2,
            density: 0.003,
            angle: random(-0.4, 0.4),
            sleepThreshold: Infinity,
        });
        Body.setAngularVelocity(body, random(-0.08, 0.08));
        Composite.add(engine.world, body);
        dynamite = { body, size, fuse: FUSE_MS };
        hint.textContent = HINT_FUSE;
        wake();
    }

    function explode(at = { ...dynamite.body.position }) {
        grabs.forEach((_, id) => release(id));
        if (dynamite) Composite.remove(engine.world, dynamite.body);
        dynamite = null;
        dug = true;
        landing = false;
        hint.textContent = found ? HINT_FOUND : HINT_BURIED;

        const spikes = Array.from({ length: 15 }, () => random(0.85, 1.15));
        blast = { x: clamp(at.x, width * 0.2, width * 0.8), y: at.y, age: 0, spikes };
        boomSound();

        if (reducedMotion.matches) {
            [...rocks].forEach(blowAway);
            wake();
            return;
        }

        const reach = avatar.offsetHeight * 0.75;
        for (const rock of [...rocks]) {
            const away = Vector.sub(rock.position, at);
            if (Vector.magnitude(away) < reach) {
                shatter(rock, at);
                blowAway(rock);
                continue;
            }
            const push = Vector.mult(Vector.normalise(away), random(24, 40));
            rock.flung = true;
            rock.collisionFilter.mask = 0; // nothing stops it, not even the walls
            Sleeping.set(rock, false);
            Body.setVelocity(rock, { x: push.x, y: push.y - random(6, 16) });
            Body.setAngularVelocity(rock, random(-0.4, 0.4));
        }
        for (let i = 0; i < 12; i++) {
            const angle = random(0, Math.PI * 2);
            const speed = random(2, 9);
            debris.push({
                x: at.x, y: at.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3,
                puff: avatar.offsetHeight * random(0.1, 0.24), age: 0, life: random(700, 1300),
            });
        }

        restart(document.documentElement, 'boom', 450);
        const toAvatar = Math.hypot(at.x - width / 2, at.y - (height - avatar.offsetHeight / 2));
        if (toAvatar < avatar.offsetHeight * 2 && !avatar.matches('.flying, .hatless')) restart(avatar, 'sooty', 2200);
        wake();
    }

    function blowAway(rock) {
        Composite.remove(engine.world, rock);
        rock.flung = false;
        rock.collisionFilter.mask = COLLIDE_ALL;
        rocks = rocks.filter((other) => other !== rock);
        blownAway.push(rock);
    }

    // Splits the rock into triangles that fly apart; they are only drawn, not simulated.
    function shatter(rock, at) {
        const { granite, tone } = rock.look;
        rock.vertices.forEach((a, i) => {
            const b = rock.vertices[(i + 1) % rock.vertices.length];
            const middle = { x: (a.x + b.x + rock.position.x) / 3, y: (a.y + b.y + rock.position.y) / 3 };
            const push = Vector.mult(Vector.normalise(Vector.sub(middle, at)), random(8, 22));
            debris.push({
                ...middle, vx: push.x + random(-3, 3), vy: push.y - random(2, 10),
                angle: 0, spin: random(-0.4, 0.4), age: 0, life: random(900, 1500),
                points: [a, b, rock.position].map((v) => Vector.sub(v, middle)),
                color: `hsl(${granite} ${random(45, 65) + tone}%)`,
            });
        });
    }

    function stepEffects() {
        for (const bit of debris) {
            bit.age += STEP;
            bit.x += bit.vx;
            bit.y += bit.vy;
            if (bit.puff) {
                bit.vx *= 0.94;
                bit.vy *= 0.94;
            } else {
                bit.vy += 0.5;
                bit.angle += bit.spin;
            }
        }
        debris = debris.filter((bit) => bit.age < bit.life);
        if (blast && (blast.age += STEP) > BLAST_MS) blast = null;
    }

    function restart(element, className, ms) {
        element.classList.remove(className);
        void element.offsetWidth; // lets the CSS animation start over
        element.classList.add(className);
        setTimeout(() => element.classList.remove(className), ms);
    }

    let audio = null;

    function boomSound() {
        try {
            audio ||= new AudioContext();
            audio.resume();
            const now = audio.currentTime;
            const length = 1.2;

            const noise = audio.createBufferSource();
            noise.buffer = audio.createBuffer(1, audio.sampleRate * length, audio.sampleRate);
            const samples = noise.buffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = random(-1, 1);
            const filter = audio.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1400, now);
            filter.frequency.exponentialRampToValueAtTime(60, now + length);

            const thump = audio.createOscillator();
            thump.frequency.setValueAtTime(120, now);
            thump.frequency.exponentialRampToValueAtTime(28, now + 0.6);

            const volume = audio.createGain();
            volume.gain.setValueAtTime(0.3, now);
            volume.gain.exponentialRampToValueAtTime(0.001, now + length);

            noise.connect(filter).connect(volume);
            thump.connect(volume);
            volume.connect(audio.destination);
            noise.start(now);
            thump.start(now);
            thump.stop(now + length);
        } catch {
            // No sound is fine.
        }
    }

    /* ---------- Finding the avatar ---------- */

    function checkFound() {
        // The button stays on the floor, even while the head inside it is away flying.
        const box = avatar.getBoundingClientRect();
        const isOpen = (x, y) => !Query.point(rocks, { x: box.left + box.width * x, y: box.top + box.height * y }).length;
        let open = 0;
        for (let row = 1; row <= 5; row++) {
            for (let column = 1; column <= 5; column++) {
                if (isOpen(column / 6, row / 6)) open++;
            }
        }
        // Nothing lies on the cap. On a phone there is no room to clear the whole body.
        const capIsFree = [0.08, 0.2, 0.3, 0.42, 0.55].every((x) => [0.04, 0.14, 0.24, 0.34].every((y) => isOpen(x, y)));
        if (landing) {
            if (open > 12 && rocks.some((rock) => !rock.isSleeping)) return;
            landing = false;
        }
        // Two thresholds, so that the hint does not flicker at the border.
        const uncovered = dug && capIsFree && open > 11;
        const now = uncovered || (found ? open > 9 : open > 15);
        if (now !== found) {
            found = now;
            if (!found) flown = false;
            if (!dynamite) hint.textContent = found ? HINT_FOUND : HINT_BURIED;
        }
        if (uncovered && !flown && !dynamite) {
            flown = true;
            // Covered in soot, it needs a moment to come round.
            setTimeout(takeOff, avatar.classList.contains('sooty') ? 2300 : 1200);
        }
    }

    function takeOff() {
        if (story.open) {
            story.addEventListener('close', () => setTimeout(takeOff, 600), { once: true });
            return;
        }
        if (!found || avatar.matches('.flying, .hatless')) return;
        avatar.classList.remove('sooty');
        if (flights++ % 2 && !reducedMotion.matches) {
            hint.textContent = HINT_FLYING;
            avatar.classList.add('flying');
            return;
        }
        hint.textContent = HINT_CAP;
        avatar.classList.add('hatless');
        setTimeout(() => {
            if (hint.textContent === HINT_CAP) hint.textContent = HINT_STORK;
        }, reducedMotion.matches ? 0 : 3000);
        if (reducedMotion.matches) setTimeout(land, 8000); // no animation to wait for
    }

    function land() {
        avatar.classList.remove('flying', 'hatless');
        if ([HINT_FLYING, HINT_STORK].includes(hint.textContent)) hint.textContent = found ? HINT_FOUND : HINT_BURIED;
    }

    avatar.addEventListener('animationend', (event) => {
        if (['flight', 'cap'].includes(event.animationName)) land();
    });

    /* ---------- Drawing ---------- */

    function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.lineJoin = 'round';
        ctx.save();
        if (blast && !reducedMotion.matches) {
            const shake = 14 * Math.max(0, 1 - blast.age / 450);
            ctx.translate(random(-shake, shake), random(-shake, shake));
        }
        for (const rock of rocks) drawRock(rock);
        if (dynamite) drawDynamite();
        for (const bit of debris) drawDebris(bit);
        if (blast) drawBlast();
        ctx.restore();
    }

    function drawDebris(bit) {
        const left = 1 - bit.age / bit.life;
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.strokeStyle = INK;
        if (bit.puff) {
            ctx.globalAlpha = Math.min(1, left * 2);
            ctx.beginPath();
            ctx.arc(0, 0, bit.puff * (1.5 - left), 0, Math.PI * 2);
            ctx.fillStyle = '#8f8a92';
            ctx.lineWidth = 3;
        } else {
            ctx.globalAlpha = Math.min(1, left * 4);
            ctx.rotate(bit.angle);
            trace(bit.points);
            ctx.fillStyle = bit.color;
            ctx.lineWidth = 2;
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function star(spikes, outer, inner) {
        return spikes.flatMap((reach, i) => {
            const step = Math.PI / spikes.length;
            const point = (r, angle) => ({ x: Math.cos(angle) * r * 1.25, y: Math.sin(angle) * r });
            return [point(outer * reach, i * 2 * step), point(inner, (i * 2 + 1) * step)];
        });
    }

    function drawBlast() {
        const { age, spikes } = blast;
        const size = Math.min(width * 0.34, height * 0.36);
        const grow = Math.min(1, age / 110);
        const shrink = clamp((BLAST_MS - age) / 180, 0, 1);
        const scale = reducedMotion.matches ? 1 : Math.max(0.01, grow * (1 + 0.15 * Math.sin(grow * Math.PI)) * shrink);

        ctx.save();
        ctx.translate(blast.x, Math.min(blast.y, height - size * 0.9));
        ctx.scale(scale, scale);
        ctx.rotate(-0.1);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        for (const [color, outer, inner] of [[RED, 1, 0.76], [PAPER, 0.86, 0.66]]) {
            trace(star(spikes, size * outer, size * inner));
            ctx.fillStyle = color;
            ctx.fill();
            ctx.stroke();
        }
        ctx.font = `${size * 0.32}px "Dela Gothic One", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = INK;
        ctx.fillText(BOOM_WORD, 0, 0);
        ctx.restore();
    }

    function drawDynamite() {
        const { body, size, fuse } = dynamite;
        const stickWidth = (size * 1.1) / 3;
        const stickHeight = size * 0.8;
        const left = fuse / FUSE_MS;

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);
        ctx.strokeStyle = INK;
        ctx.lineCap = 'round';

        const tip = { x: size * 0.45 * left, y: -stickHeight / 2 - size * 0.38 * left };
        ctx.beginPath();
        ctx.moveTo(0, -stickHeight / 2);
        ctx.quadraticCurveTo(0, tip.y, tip.x, tip.y);
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.lineWidth = 3;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.rect(i * stickWidth - stickWidth / 2, -stickHeight / 2, stickWidth, stickHeight);
            ctx.fillStyle = RED;
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgb(255 255 255 / 0.3)';
            ctx.fillRect(i * stickWidth - stickWidth * 0.3, -stickHeight * 0.42, stickWidth * 0.16, stickHeight * 0.84);
        }
        ctx.beginPath();
        ctx.rect(-size * 0.57, -stickHeight * 0.14, size * 1.14, stickHeight * 0.28);
        ctx.fillStyle = '#f2d9a0';
        ctx.fill();
        ctx.stroke();

        ctx.translate(tip.x, tip.y);
        ctx.rotate(random(0, Math.PI));
        trace(star([1, 1, 1, 1, 1, 1], size * random(0.16, 0.26), size * 0.08));
        ctx.fillStyle = Math.random() < 0.5 ? PAPER : '#ff9d2e';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function trace(points) {
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
    }

    function drawRock(rock) {
        const { local, face, granite, tone, word, fontSize } = rock.look;
        const shade = (lightness) => `hsl(${granite} ${lightness + tone}%)`;
        const light = Vector.rotate(LIGHT, -rock.angle);

        ctx.save();
        ctx.translate(rock.position.x, rock.position.y);
        ctx.rotate(rock.angle);

        local.forEach((a, i) => {
            const j = (i + 1) % local.length;
            const b = local[j];
            const normal = Vector.normalise({ x: b.y - a.y, y: a.x - b.x });
            trace([a, b, face[j], face[i]]);
            ctx.fillStyle = ctx.strokeStyle = shade(52 + 24 * Vector.dot(normal, light));
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
        });

        trace(face);
        ctx.fillStyle = shade(63);
        ctx.fill();

        trace(local);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.stroke();

        if (word) {
            ctx.font = `${fontSize}px "Dela Gothic One", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // A lit lower edge makes the letters look cut into the stone.
            const edge = Vector.mult(light, -1.2);
            ctx.fillStyle = shade(86);
            ctx.fillText(word, edge.x, edge.y);
            ctx.fillStyle = shade(22);
            ctx.fillText(word, 0, 0);
        }
        ctx.restore();
    }

    /* ---------- Pointer ---------- */

    const rockAt = (event) => {
        if (gathering || story.open) return null;
        // The last rock is drawn on top.
        return Query.point(things(), { x: event.clientX, y: event.clientY }).pop() || null;
    };

    function grab(event, rock) {
        dug = true;
        const point = { x: event.clientX, y: event.clientY };
        const constraint = Constraint.create({
            pointA: point,
            bodyB: rock,
            pointB: Vector.sub(point, rock.position),
            length: 0,
            stiffness: 0.15,
            damping: 0.1,
        });
        Composite.add(engine.world, constraint);
        grabs.set(event.pointerId, { constraint, rock, start: point, time: event.timeStamp, moved: false });
        document.documentElement.classList.add('grabbing');
        wake();
    }

    function release(pointerId) {
        const held = grabs.get(pointerId);
        if (!held) return null;
        Composite.remove(engine.world, held.constraint);
        grabs.delete(pointerId);
        if (!grabs.size) document.documentElement.classList.remove('grabbing');
        wake();
        return held;
    }

    let swallowClick = false;
    let lastTap = null;

    addEventListener('pointerdown', (event) => {
        swallowClick = false;
        if (event.button !== 0) return;
        const rock = rockAt(event);
        if (!rock) return;
        swallowClick = true;
        event.preventDefault();
        grab(event, rock);
    });

    addEventListener('pointermove', (event) => {
        const held = grabs.get(event.pointerId);
        if (held) {
            held.constraint.pointA = { x: event.clientX, y: clamp(event.clientY, 0, height) };
            held.moved ||= Math.hypot(event.clientX - held.start.x, event.clientY - held.start.y) > TAP_SLOP;
        } else if (event.pointerType === 'mouse') {
            document.documentElement.classList.toggle('can-grab', Boolean(rockAt(event)));
        }
    });

    // On a narrow screen a rock dropped at the edge, or thrown at it, leaves the screen.
    function throwOut(rock, x) {
        if (width >= NARROW || rock === dynamite?.body || rock.flung) return;
        const speed = rock.velocity.x;
        const side = x < EDGE || speed < -14 ? -1 : x > width - EDGE || speed > 14 ? 1 : 0;
        if (!side) return;
        rock.flung = true;
        rock.collisionFilter.mask = 0;
        Body.setVelocity(rock, { x: side * Math.max(Math.abs(speed), 16), y: Math.min(rock.velocity.y, -4) });
    }

    addEventListener('pointerup', (event) => {
        const held = release(event.pointerId);
        if (held?.moved) throwOut(held.rock, event.clientX);
        const onControl = !held && event.target.closest?.('a, button, dialog');
        if (event.button !== 0 || held?.moved || onControl || story.open) {
            lastTap = null;
            return;
        }

        const near = lastTap && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < TAP_SLOP * 4;
        if (near && event.timeStamp - lastTap.time < TAP_MS) {
            lastTap = null;
            gather();
            return;
        }
        lastTap = { x: event.clientX, y: event.clientY, time: event.timeStamp };

        if (held?.rock.look?.gold) hint.textContent = HINT_GOLD;
        if (held?.rock.look?.word) {
            hint.textContent = `“${held.rock.look.word}” is ${held.rock.look.language} for “stone”.`;
            if (held.rock.look.word === 'stone') hint.textContent += ' Obviously.';
            if (held.rock.look.word === HOME[0]) hint.textContent += ' Russian spells it the same.';
        }
    });

    addEventListener('pointercancel', (event) => release(event.pointerId));
    addEventListener('blur', () => grabs.forEach((_, id) => release(id)));

    // Stops the page from scrolling or zooming while a finger is on a rock.
    addEventListener('touchstart', (event) => {
        if ([...event.changedTouches].some((touch) => rockAt(touch))) event.preventDefault();
    }, { passive: false });

    // Grabbing a rock must not press the link or the avatar underneath it.
    addEventListener('click', (event) => {
        // Clicks made from the keyboard have no pointer behind them.
        if (swallowClick && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
        }
        swallowClick = false;
    }, true);

    addEventListener('dragstart', (event) => {
        if (grabs.size) event.preventDefault();
    });

    /* ---------- Phone: tilt and shake ---------- */

    function onTilt({ beta, gamma }) {
        if (beta === null || gamma === null) return;
        tiltButton.hidden = true;
        const b = (beta * Math.PI) / 180;
        const g = (gamma * Math.PI) / 180;
        // Gravity along the sides of the phone, then along the sides of the screen.
        const right = Math.cos(b) * Math.sin(g);
        const down = Math.sin(b);
        const angle = screen.orientation?.angle ?? 0;
        const turned = { 0: [right, down], 90: [down, -right], 180: [-right, -down], 270: [-down, right] };
        const [x, y] = turned[angle] || turned[0];

        // Lying flat there is no telling where down is, so it stays where it was.
        const pull = Math.hypot(x, y);
        if (pull < 0.25) return;
        const strength = clamp(pull * 1.3, 0.5, 1) / pull;
        const next = { x: Math.abs(x) < 0.15 ? 0 : x * strength, y: y * strength };
        if (Math.hypot(next.x - tilt.x, next.y - tilt.y) < 0.12) return;
        tilt = next;
        engine.gravity.x = next.x;
        engine.gravity.y = next.y;
        if (next.y < 0) dug = true;
        hangCeiling();
        wake();
    }

    function onShake({ acceleration }, now = performance.now()) {
        if (!acceleration || acceleration.x === null || gathering || story.open) return;
        const force = Math.hypot(acceleration.x, acceleration.y, acceleration.z);
        if (force < 18 || now - lastShake < 900) return;
        lastShake = now;
        dug = true;
        wake();
        for (const rock of rocks) {
            if (rock.flung) continue;
            Body.setVelocity(rock, { x: random(-26, 26), y: random(-26, -8) });
            Body.setAngularVelocity(rock, random(-0.3, 0.3));
        }
    }

    let tilt = { x: 0, y: 1 };
    let lastShake = 0;

    function followPhone() {
        addEventListener('deviceorientation', onTilt);
        addEventListener('devicemotion', onShake);
    }

    // Most phones send motion data right away. iPhones stay silent until the visitor
    // allows it, so the button is there until the first real reading.
    if (!reducedMotion.matches && matchMedia('(pointer: coarse)').matches) {
        followPhone();
        tiltButton.hidden = typeof window.DeviceOrientationEvent?.requestPermission !== 'function';
    }

    tiltButton.addEventListener('click', async () => {
        try {
            const answer = await DeviceOrientationEvent.requestPermission();
            hint.textContent = answer === 'granted' ? HINT_TILT : HINT_NO_TILT;
        } catch {
            hint.textContent = HINT_NO_TILT;
        }
        tiltButton.hidden = true;
    });

    /* ---------- Secret words ---------- */

    function pourRocks() {
        const room = CAP_ROCKS - rocks.length - blownAway.length;
        const unit = avatar.offsetHeight * 0.17;
        for (let i = 0; i < Math.min(room, 10); i++) {
            const rock = createPlainRock(unit);
            Body.setPosition(rock, { x: random(width * 0.15, width * 0.85), y: -60 - i * unit * 2.4 });
            Composite.add(engine.world, rock);
            rocks.unshift(rock);
        }
        wake();
        if (reducedMotion.matches) settle();
    }

    let typed = '';
    let pressed = ''; // the same keys as on a Latin layout

    addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || story.open || gathering) return;
        if (event.key.length === 1) typed = (typed + event.key.toLowerCase()).slice(-10);
        if (event.code.startsWith('Key')) pressed = (pressed + event.code.slice(3).toLowerCase()).slice(-10);
        if (SECRET_WORDS.some((word) => typed.endsWith(word)) || pressed.endsWith('rock')) {
            typed = '';
            pressed = '';
            pourRocks();
        }
    });

    /* ---------- Buttons ---------- */

    gatherButton.addEventListener('click', gather);
    dynamiteButton.addEventListener('click', throwDynamite);
    avatar.addEventListener('click', () => story.showModal());
    story.addEventListener('click', (event) => {
        if (event.target !== story) return;
        const box = story.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right
            && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) story.close();
    });

    /* ---------- Start ---------- */

    document.getElementById('play').hidden = false;
    resize();
    build();

    new ResizeObserver(resize).observe(stage);
    document.fonts.load('20px "Dela Gothic One"', 'камень kamień').then(draw, () => {});
})();
