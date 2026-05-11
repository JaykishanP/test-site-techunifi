

// ============= Animation Illustration ============= //

document.addEventListener("DOMContentLoaded", () => {
  const areas = document.querySelectorAll(".imagemap .area");

  // Prevent errors if elements don't exist
  if (!areas.length) return;

  const areaCount = areas.length;
  let currentIndex = 0;
  let intervalId;

  const cycleDuration = 3000;

  // Set active item
  function setActiveArea(index) {
    areas.forEach((area) => {
      area.classList.remove("active-animate");
    });

    areas[index].classList.add("active-animate");

    currentIndex = (index + 1) % areaCount;
  }

  // Start loop
  function startLoop() {
    setActiveArea(currentIndex);

    intervalId = setInterval(() => {
      setActiveArea(currentIndex);
    }, cycleDuration);
  }

  // Stop loop
  function stopLoop() {
    clearInterval(intervalId);
  }

  // Initialize
  startLoop();

  // Hover events
  areas.forEach((area) => {
    area.addEventListener("mouseenter", () => {
      stopLoop();
      area.classList.remove("active-animate");
    });

    area.addEventListener("mouseleave", () => {
      const hoveredIndex = Array.from(areas).indexOf(area);

      currentIndex = (hoveredIndex + 1) % areaCount;

      startLoop();
    });
  });
});


// =============== Video Animation =============== //

document.addEventListener("DOMContentLoaded", () =>{
      // Scroll Reveal Animation
  const cards = document.querySelectorAll('.service-card');

  const observer = new IntersectionObserver((entries) => {

    entries.forEach((entry, index) => {

      if(entry.isIntersecting){

        setTimeout(() => {
          entry.target.classList.add('show');
        }, index * 120);

      }

    });

  }, {
    threshold:0.2
  });

  cards.forEach(card => {
    observer.observe(card);
  });
})


// ========= How It Works ========= //
window.addEventListener('scroll', () => {
    const trigger = document.querySelector('.parallax-trigger');
    const content = document.querySelector('.parallax-content');
    const steps = document.querySelectorAll('.p-step');
    const imgs = document.querySelectorAll('.p-img');

    const rect = trigger.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    // 1. STICKING LOGIC (Fixed Toggle)
    if (rect.top <= 0 && rect.bottom >= windowHeight) {
        // We are inside the section - Lock it!
        content.classList.add('is-fixed');
        content.classList.remove('is-bottom');
    } else if (rect.bottom < windowHeight) {
        // We scrolled past it - Park it at the bottom
        content.classList.remove('is-fixed');
        content.classList.add('is-bottom');
    } else {
        // We are above it - Put it back at the top
        content.classList.remove('is-fixed');
        content.classList.remove('is-bottom');
    }

    // 2. STEP REVEAL LOGIC
    // Calculate progress based on how much of the section has passed the top
    const totalPath = trigger.offsetHeight - windowHeight;
    const scrollDepth = -rect.top;
    let progress = Math.max(0, Math.min(scrollDepth / totalPath, 0.99));

    const currentIndex = Math.floor(progress * steps.length);

    steps.forEach((step, i) => {
        if (i === currentIndex) {
            step.classList.add('active');
            imgs[i].classList.add('active');
        } else {
            step.classList.remove('active');
            imgs[i].classList.remove('active');
        }
    });
});


// ========== Client Images Modal ======== //
document.addEventListener("DOMContentLoaded", () => {
    function moveSlider(direction) {
  const gallery = document.querySelector('.interactive-gallery');
  const itemWidth = 415; // Width (400px) + Gap (15px)
  
  // Scroll by one item width in the chosen direction
  gallery.scrollBy({
    left: direction * itemWidth,
    behavior: 'smooth'
  });
}

// Optional: Handle the "infinite" loop reset
// This checks if we reached the end of the first set and snaps back
const gallery = document.querySelector('.interactive-gallery');
gallery.addEventListener('scroll', () => {
  const track = document.querySelector('.gallery-track');
  const halfWidth = track.offsetWidth / 2;

  if (gallery.scrollLeft >= halfWidth) {
    gallery.scrollLeft = 1; // Snap to start
  } else if (gallery.scrollLeft <= 0) {
    gallery.scrollLeft = halfWidth - 1; // Snap to middle
  }
});
})