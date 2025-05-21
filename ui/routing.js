export function initializeRouting() {
    // Set up page navigation
    setupNavigationLinks();
    showPage(getInitialPage());
}

export function handleRouting(event) {
    const pageId = event.state?.page || getInitialPage();
    showPage(pageId);
}

// Private implementation details
function setupNavigationLinks() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Use currentTarget instead of target
            const pageId = e.currentTarget.dataset.page;
            console.log('Navigating to:', pageId);

            if (!pageId) {
                console.error('Missing data-page attribute on:', e.currentTarget);
                return;
            }

            showPage(pageId);
            history.pushState({ page: pageId }, '', `#${pageId}`);
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