export function initializeRouting() {
    // Set up page navigation
    setupNavigationLinks();
    showPage(getInitialPage());
}

export function handleRouting(event) {
    const pageId = event.state?.page || getInitialPage();
    showPage(pageId);
}

function setupNavigationLinks() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page');

            // Remove 'active' from all nav links
            document.querySelectorAll('.nav-links a').forEach(nav => {
                nav.classList.remove('active');
            });

            // Add 'active' to the clicked link
            link.classList.add('active');

            // Show the clicked page and hide others
            document.querySelectorAll('main .page').forEach(section => {
                section.classList.toggle('active', section.id === page);
            });

            // Show or hide shared parameters
            const sharedParams = document.getElementById('sharedParameters');
            if (page === 'tutorial') {
                sharedParams.style.display = 'none';
            }
            else {
                sharedParams.style.display = 'block';
            }
        });
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.toggle('active', page.id === pageId);
    });
}

function getInitialPage() {
    return window.location.hash.substring(1) || 'prospective';
}