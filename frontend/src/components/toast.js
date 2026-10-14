import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderToasts(container) {
  const toasts = store.toasts;

  if (toasts.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="toast-container">
      ${toasts.map(t => `
        <div class="toast ${t.type}" data-id="${t.id}">
          ${t.type === 'success' ? icons.check : icons.activity}
          <span>${t.message}</span>
        </div>
      `).join('')}
    </div>
  `;
}
