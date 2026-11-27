import React, { useRef, useState } from 'react';
import { Camera, Trash2, User } from 'lucide-react';
import { apiFetch, apiUpload } from '../lib/api';
import { PhotoFitModal } from './PhotoFitModal';

interface ProfilePhotoUploaderProps {
  currentPhotoUrl: string | null;
  fullName: string;
  onUpdated: (newUrl: string | null) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export function ProfilePhotoUploader({
  currentPhotoUrl,
  fullName,
  onUpdated,
}: ProfilePhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Please select a JPG, JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File is too large. Maximum allowed size is 5 MB.');
      return;
    }
    setPendingCropFile(file);
  };

  const handleConfirmCroppedUpload = async (croppedBlob: Blob) => {
    setPendingCropFile(null);
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append('photo', croppedBlob, 'profile-photo.jpg');
      const res = await apiUpload<{ ok: boolean; photo_url: string }>(
        '/api/student/profile/photo',
        fd
      );
      if (!res?.photo_url) {
        throw new Error('Unable to save uploaded photo. Please try again.');
      }
      setSuccess('Profile photo fitted and saved successfully.');
      onUpdated(res.photo_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch('/api/student/profile/photo', { method: 'DELETE' });
      setSuccess('Profile photo removed.');
      onUpdated(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="w-28 aspect-[5/6] rounded-lg border-2 border-[#1D3557]/30 bg-white p-1 overflow-hidden shrink-0 flex items-center justify-center">
          {currentPhotoUrl ? (
            <img
              src={currentPhotoUrl}
              alt={`${fullName} portrait`}
              className="w-full h-full object-cover object-top rounded block"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center bg-slate-100 w-full h-full rounded">
              <User className="w-8 h-8 mb-1" />
              <span className="text-[11px] font-medium">No Photo</span>
            </div>
          )}
        </div>

        <div className="space-y-2.5 flex-1">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Official Student Photograph
            </h3>
            <p className="text-sm text-slate-600">
              Required for TechTalkHub certificates and QR verification records. You can adjust
              the crop and fit right after choosing your photo (JPG, PNG, WebP).
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              {uploading
                ? 'Uploading...'
                : currentPhotoUrl
                  ? 'Change & Adjust Photo'
                  : 'Select & Fit Photo'}
            </button>

            {currentPhotoUrl && (
              <button
                type="button"
                disabled={uploading}
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          {success && <p className="text-sm text-emerald-700 font-medium">{success}</p>}
        </div>
      </div>

      {pendingCropFile && (
        <PhotoFitModal
          file={pendingCropFile}
          title="Fit Student Certificate Photo"
          onCancel={() => setPendingCropFile(null)}
          onConfirm={(blob) => handleConfirmCroppedUpload(blob)}
        />
      )}
    </div>
  );
}
