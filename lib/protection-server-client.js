'use client';

import axios from 'axios';

export async function uploadProtectedViaServer(item, reservationId, onProgress) {
  const form = new FormData();
  form.append('reservationId', reservationId);
  form.append('file', item.file, item.name);
  const token = localStorage.getItem('snapnext_token');
  const response = await axios.post('/api/protection/upload', form, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    onUploadProgress: (event) => onProgress?.(event.loaded || 0, event.total || item.size),
  });
  return response.data;
}
