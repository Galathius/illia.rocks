document.addEventListener('DOMContentLoaded', function() {
    const ROCK_PILE_AREA = document.getElementById('rockPile');

    const ROCK_EMOJI = '🪨';
    const ROCK_SIZES = ['3rem', '2.5rem', '2rem'];
    
    function generateRocks() {
        for (let i = 1; i <= 20; i++) {
            const rock = document.createElement('div');
            rock.className = 'rock';
            rock.dataset.rock = i.toString();
            
            rock.textContent = ROCK_EMOJI;
            // 50% medium (2.0rem), 25% large (3rem), 25% small (1rem)
            const rand = Math.random();
            let sizeIndex;
            if (rand < 0.25) {
                sizeIndex = 0; // large (3rem)
            } else if (rand < 0.75) {
                sizeIndex = 1; // medium (2.0rem) - 50% chance
            } else {
                sizeIndex = 2; // small (1rem)
            }
            rock.style.fontSize = ROCK_SIZES[sizeIndex];
            
            // Add random initial rotation
            const randomRotation = Math.random() * 360;
            rock.setAttribute('data-rotation', randomRotation);
            rock.style.transform = `rotate(${randomRotation}deg)`;
            
            // Position rocks to completely cover the centered avatar
            // Avatar is centered in 150x150px container
            
            const avatarCenterX = 75; // Center of 150px container
            const avatarCenterY = 75; // Center of 150px container
            
            // Create concentric circles of rocks around avatar
            const angle = (i * 2 * Math.PI) / 20; // Distribute evenly in circle
            const radius = 25 + (i % 2) * 15; // Two layers: 25px, 40px radius
            
            const x = avatarCenterX + Math.cos(angle) * radius - 15; // -15 to center rock
            const y = avatarCenterY + Math.sin(angle) * radius - 15; // -15 to center rock
            
            // Add some randomness while ensuring coverage
            const finalX = x + (Math.random() * 8 - 4);
            const finalY = y + (Math.random() * 8 - 4);
            
            rock.style.left = finalX + 'px';
            rock.style.top = finalY + 'px';
            
            ROCK_PILE_AREA.appendChild(rock);
        }
    }
    
    generateRocks();
    
    const ROCKS = document.querySelectorAll('.rock');

    interact('.rock')
    .draggable({
        inertia: true,
        
        // Allow dragging anywhere on the page
        modifiers: [
            interact.modifiers.restrictRect({
                restriction: 'body',
                endOnly: true
            })
        ],
        
        // Enable autoScroll
        autoScroll: true,

        listeners: {
            // Call this function on every dragmove event
            move: dragMoveListener,
            
            // Call this function on every dragstart event
            start: function (event) {
                event.target.classList.add('dragging');
            },
            
            // Call this function on every dragend event
            end: function (event) {
                event.target.classList.remove('dragging');
            }
        }
    });

function dragMoveListener(event) {
    var target = event.target;
    // Keep the dragged position in the data-x/data-y attributes
    var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
    var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

    // Calculate rotation based on movement distance for rolling effect
    var distance = Math.sqrt(event.dx * event.dx + event.dy * event.dy);
    var currentRotation = parseFloat(target.getAttribute('data-rotation')) || 0;
    var newRotation = currentRotation + (distance * 2); // Adjust multiplier for roll speed
    
    // Translate and rotate the element
    target.style.transform = 'translate(' + x + 'px, ' + y + 'px) scale(1.2) rotate(' + newRotation + 'deg)';

    // Update the position and rotation attributes
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
    target.setAttribute('data-rotation', newRotation);
}


    // Add avatar click functionality
    const avatar = document.getElementById('avatar');
    const popup = document.getElementById('comicPopup');
    const overlay = document.getElementById('popupOverlay');
    
    avatar.addEventListener('click', function() {
        popup.classList.add('show');
        overlay.classList.add('show');
    });
    
    // Close popup when clicking overlay
    overlay.addEventListener('click', function() {
        popup.classList.remove('show');
        overlay.classList.remove('show');
    });
    
    // Close popup when pressing escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            popup.classList.remove('show');
            overlay.classList.remove('show');
        }
    });

    // Add reset functionality (double-click to reset all rocks)
    document.addEventListener('dblclick', function() {
        ROCKS.forEach(rock => {
            rock.style.transform = 'translate(0px, 0px)';
            rock.setAttribute('data-x', 0);
            rock.setAttribute('data-y', 0);
        });
    });
});
