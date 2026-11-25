(() => {
    const { Engine, Composite, Bodies, Body, Constraint, Query, Sleeping, Vertices, Vector } = Matter;

    const MIN_ROCKS = 14;
    const MAX_ROCKS = 46;
    const ENGRAVED = [
        ['камень', 'Russian'],
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

    // Hue and saturation of the granite; lightness comes from the light direction.
    const GRANITES = ['225 7%', '32 7%', '205 10%', '270 5%'];
    const INK = '#211c24';
    const LIGHT = Vector.normalise({ x: -0.45, y: -0.9 });

    const STEP = 1000 / 60;
    const MAX_SPEED = 45;
    const GATHER_MS = 650;
    const TAP_MS = 300;
    const TAP_SLOP = 8;
    const WALL = 400;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const stage = document.getElementById('stage');
    const avatar = document.getElementById('avatar');
    const story = document.getElementById('story');
    const hint = document.getElementById('hint');
    const gatherButton = document.getElementById('gather');
    const ctx = stage.getContext('2d');

    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    const grabs = new Map(); // pointerId -> { constraint, rock, start, moved }
    let rocks = [];
    let bounds = [];
    let width = 0;
    let height = 0;
    let builtFor = 0; // avatar height the current rocks were made for
    let gathering = null;
    let found = false;
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

    function createRocks() {
        const unit = avatar.offsetHeight * 0.17;
        // Enough to cover the avatar, without burying the text on a narrow screen.
        const total = clamp(Math.round((width / avatar.offsetHeight) * 9.5), MIN_ROCKS, MAX_ROCKS);
        const words = shuffle(ENGRAVED).slice(0, Math.round(total / 4));
        const plain = Array.from({ length: total - words.length }, () => {
            const size = unit * random(0.6, 1.35);
            const points = outline(size * random(1, 1.3), size, Math.round(random(6, 9)));
            return createRock(points, { inset: [0.4, 0.78] });
        });
        const engraved = words.map(([word, language]) => {
            const halfWidth = unit * (0.75 + word.length * 0.2);
            const rock = createRock(outline(halfWidth, unit * 0.95, 10), { inset: [0.8, 0.86], word, language });
            rock.look.fontSize = unit * 0.5;
            return rock;
        });

        return shuffle([...plain, ...engraved]);
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
        Composite.remove(engine.world, rocks);
        builtFor = avatar.offsetHeight;
        rocks = createRocks();
        Composite.add(engine.world, rocks);
        drop(-avatar.offsetHeight * 0.3);
    }

    function keepInside(rock) {
        const x = clamp(rock.position.x, 30, Math.max(30, width - 30));
        const y = Math.min(rock.position.y, height - 10);
        if (x !== rock.position.x || y !== rock.position.y) Body.setPosition(rock, { x, y });
    }

    /* ---------- Simulation ---------- */

    function wake() {
        for (const rock of rocks) Sleeping.set(rock, false);
        if (!frame) {
            lastTime = 0;
            frame = requestAnimationFrame(tick);
        }
    }

    function step() {
        Engine.update(engine, STEP);
        for (const rock of rocks) {
            if (rock.speed > MAX_SPEED) {
                Body.setVelocity(rock, Vector.mult(Vector.normalise(rock.velocity), MAX_SPEED));
            }
            const { x, y } = rock.position;
            if (x < 0 || x > width || y > height) keepInside(rock);
        }
    }

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

        const busy = gathering || grabs.size > 0 || rocks.some((rock) => !rock.isSleeping);
        if (busy) frame = requestAnimationFrame(tick);
    }

    function settle() {
        for (let i = 0; i < 600 && rocks.some((rock) => !rock.isSleeping); i++) step();
        for (const rock of rocks) Sleeping.set(rock, true);
        draw();
        checkFound();
    }

    function drop(bottom) {
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

    /* ---------- Finding the avatar ---------- */

    function checkFound() {
        const box = avatar.getBoundingClientRect();
        let open = 0;
        for (let row = 1; row <= 5; row++) {
            for (let column = 1; column <= 5; column++) {
                const point = { x: box.left + (box.width * column) / 6, y: box.top + (box.height * row) / 6 };
                if (!Query.point(rocks, point).length) open++;
            }
        }
        // Two thresholds, so that the hint does not flicker at the border.
        const now = found ? open > 9 : open > 15;
        if (now !== found) {
            found = now;
            hint.textContent = found ? HINT_FOUND : HINT_BURIED;
        }
    }

    /* ---------- Drawing ---------- */

    function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.lineJoin = 'round';
        for (const rock of rocks) drawRock(rock);
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
        return Query.point(rocks, { x: event.clientX, y: event.clientY }).pop() || null;
    };

    function grab(event, rock) {
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

    addEventListener('pointerup', (event) => {
        const held = release(event.pointerId);
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

        if (held?.rock.look.word) {
            hint.textContent = `“${held.rock.look.word}” is ${held.rock.look.language} for “stone”.`;
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

    /* ---------- Controls ---------- */

    gatherButton.addEventListener('click', gather);
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
