/**
 * Lightweight markdown → HTML converter.
 * Handles patterns common in implementation plans.
 */
export function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^## (.+)$/gm, '<h4>$1</h4>')
    .replace(/^# (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="md-ol">$1</li>')
    .replace(/^[-*]\s+(.+)$/gm, '<li class="md-ul">$1</li>')
    .replace(/\n/g, '<br/>');
}
