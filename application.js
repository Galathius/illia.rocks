// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const ROCK_PILE_AREA = document.getElementById('rockPile');
    const AVATAR = document.getElementById('avatar');
    
    // Track which rocks are still in the pile area
    let rocksInPile = new Set();
    
    // Rock emoji and size
    const ROCK_EMOJI = '🪨';
    const ROCK_SIZES = ['3rem', '2.5rem', '2rem'];
    
    function generateRocks() {
        for (let i = 1; i <= 20; i++) {
            const rock = document.createElement('div');
            rock.className = 'rock';
            rock.dataset.rock = i.toString();
            
            // Use rock emoji with consistent size
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
            
            // Add to pile area and tracking set
            ROCK_PILE_AREA.appendChild(rock);
            rocksInPile.add(i.toString());
        }
    }
    
    // Generate the rocks
    generateRocks();
    
    // Get all rocks after generation
    const ROCKS = document.querySelectorAll('.rock');

    // Make rocks draggable with interact.js
    interact('.rock')
    .draggable({
        // Enable inertial throwing
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

    // Translate the element
    target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

    // Update the position attributes
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
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

    // Optional: Add reset functionality (double-click to reset all rocks)
    document.addEventListener('dblclick', function() {
        ROCKS.forEach(rock => {
            rock.style.transform = 'translate(0px, 0px)';
            rock.setAttribute('data-x', 0);
            rock.setAttribute('data-y', 0);
        });
    });
});
