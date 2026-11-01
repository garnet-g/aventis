/**
 * POSTs a form and reports upload progress (fetch cannot). Resolves with the HTTP status and the JSON body
 * (null if the response was not JSON); rejects only when the network itself fails.
 */
export function postFormWithProgress(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response ?? null });
    xhr.onerror = () => reject(new Error('Network error while uploading.'));
    xhr.ontimeout = () => reject(new Error('Network timeout while uploading.'));
    xhr.send(form);
  });
}
