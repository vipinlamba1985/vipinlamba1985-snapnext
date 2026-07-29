'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useEscapeClose(open, onClose, { lockScroll = false, restoreFocus = true } = {}) {
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      if (restoreFocus && previousFocus.current?.focus) window.setTimeout(() => previousFocus.current?.focus(), 0);
    };
  }, [open, onClose, lockScroll, restoreFocus]);
}

export function useAccessibleDialog(open, onClose) {
  const dialogRef = useRef(null);
  useEscapeClose(open, onClose, { lockScroll: true, restoreFocus: true });

  useEffect(() => {
    if (!open || !dialogRef.current) return undefined;
    const dialog = dialogRef.current;
    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
    const first = focusables()[0] || dialog;
    window.setTimeout(() => first.focus?.(), 0);

    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (!nodes.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [open]);

  return dialogRef;
}
