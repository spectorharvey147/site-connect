import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as NativeCamera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';
import { Button } from '@/components/ui/button';
import { Camera, ImagePlus, X, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'application/pdf'];
const ACCEPTED_EXT = '.jpg,.jpeg,.pdf';
const TOTAL_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const IMAGE_COMPRESSION_QUALITIES = [0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82];
const IMAGE_COMPRESSION_SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];

interface FileUploadProps {
  claimId: string;
  onFilesUploaded?: (fileIds: string[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  compact?: boolean;
}

export interface FileUploadHandle {
  uploadAll: () => Promise<string[]>;
  getFileCount: () => number;
}

interface PendingFile {
  file: File;
  preview?: string;
  uploading: boolean;
  uploaded: boolean;
  path?: string;
}

const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(
  ({ claimId, onFilesUploaded, maxFiles = 10, maxSizeMB = 5, compact = false }, ref) => {
    const [files, setFiles] = useState<PendingFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    const validateFile = (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) return `${file.name}: Only PDF and JPEG files are allowed`;
      if (file.size > maxSizeBytes) return `${file.name}: File size exceeds ${maxSizeMB}MB limit`;
      return null;
    };

    const formatFileSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

    const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image for compression.'));
      };
      img.src = url;
    });

    const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not compress image.'));
      }, 'image/jpeg', quality);
    });

    const blobToFile = (blob: Blob, name: string) => new File([blob], name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    const compressImageIfNeeded = async (file: File) => {
      if (!file.type.startsWith('image/') || file.size <= maxSizeBytes) {
        return { file, compressed: false };
      }

      const img = await loadImage(file);
      let bestFile: File | null = null;

      for (const scale of IMAGE_COMPRESSION_SCALES) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not prepare image compression.');

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        for (const quality of IMAGE_COMPRESSION_QUALITIES) {
          const blob = await canvasToBlob(canvas, quality);
          const candidate = blobToFile(blob, file.name);
          if (!bestFile || candidate.size < bestFile.size) bestFile = candidate;
          if (candidate.size <= maxSizeBytes) {
            return { file: candidate, compressed: true };
          }
        }
      }

      if (bestFile && bestFile.size < file.size) {
        return { file: bestFile, compressed: true };
      }

      return { file, compressed: false };
    };

    const handleFiles = async (selectedFiles: FileList | File[] | null) => {
      if (!selectedFiles) return;
      setProcessing(true);
      let queuedSize = files.reduce((sum, f) => sum + f.file.size, 0);
      const newFiles: PendingFile[] = [];

      try {
        for (let i = 0; i < selectedFiles.length; i++) {
          if (files.length + newFiles.length >= maxFiles) {
            toast.error(`Maximum ${maxFiles} files allowed`);
            break;
          }

          const originalFile = selectedFiles[i];
          const prepared = originalFile.type.startsWith('image/')
            ? await compressImageIfNeeded(originalFile)
            : { file: originalFile, compressed: false };
          const file = prepared.file;
          const error = validateFile(file);
          if (error) { toast.error(error); continue; }
          if (queuedSize + file.size > TOTAL_UPLOAD_LIMIT_BYTES) { toast.error('Total upload limit is 50MB'); break; }

          if (prepared.compressed) {
            toast.success(`Optimized ${originalFile.name} from ${formatFileSize(originalFile.size)} to ${formatFileSize(file.size)}`);
          }

          queuedSize += file.size;
          const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
          newFiles.push({ file, preview, uploading: false, uploaded: false });
        }

        setFiles(prev => [...prev, ...newFiles]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not process selected file');
      } finally {
        setProcessing(false);
      }
    };

    const removeFile = (idx: number) => {
      setFiles(prev => {
        const updated = [...prev];
        if (updated[idx].preview) URL.revokeObjectURL(updated[idx].preview!);
        updated.splice(idx, 1);
        return updated;
      });
    };

    const isCameraCancelError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error || '');
      return /cancel|dismiss|abort/i.test(message);
    };

    const photoToFile = async (webPath: string) => {
      const response = await fetch(webPath);
      const blob = await response.blob();
      return new File([blob], `claim-photo-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    };

    const handleCameraCapture = async () => {
      if (!Capacitor.isNativePlatform()) {
        cameraInputRef.current?.click();
        return;
      }

      setProcessing(true);
      try {
        const permissions = await NativeCamera.requestPermissions({ permissions: ['camera'] });
        if (permissions.camera !== 'granted') {
          toast.error('Camera permission is required to capture a receipt.');
          return;
        }

        const photo = await NativeCamera.getPhoto({
          quality: 100,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          direction: CameraDirection.Rear,
          correctOrientation: true,
          allowEditing: false,
          saveToGallery: false,
        });

        if (!photo.webPath) throw new Error('Camera did not return a readable photo.');
        const file = await photoToFile(photo.webPath);
        await handleFiles([file]);
      } catch (err) {
        if (!isCameraCancelError(err)) {
          toast.error(err instanceof Error ? err.message : 'Could not open camera');
        }
      } finally {
        setProcessing(false);
      }
    };

    const uploadAll = async (): Promise<string[]> => {
      if (files.length === 0) return [];
      setUploading(true);
      const uploadedPaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        if (files[i].uploaded && files[i].path) {
          uploadedPaths.push(files[i].path!);
          continue;
        }
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: true } : f));

        const ext = files[i].file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${claimId}/${Date.now()}-${i}.${ext}`;

        const { error } = await supabase.storage.from('claim-attachments').upload(path, files[i].file, {
          contentType: files[i].file.type,
        });

        if (error) {
          toast.error(`Failed to upload ${files[i].file.name}`);
          setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: false } : f));
        } else {
          uploadedPaths.push(path);
          setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: false, uploaded: true, path } : f));
        }
      }

      setUploading(false);
      if (onFilesUploaded) onFilesUploaded(uploadedPaths);
      return uploadedPaths;
    };

    useImperativeHandle(ref, () => ({
      uploadAll,
      getFileCount: () => files.length,
    }));

    const controls = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={processing || uploading}>
            <ImagePlus className="mr-1 h-4 w-4" /> Gallery
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleCameraCapture} disabled={processing || uploading}>
            {processing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
            Camera
          </Button>
          <span className="text-xs text-muted-foreground">PDF, JPEG - Max {maxSizeMB}MB each</span>
        </div>

        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXT} multiple className="hidden" onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }} />
        <input ref={cameraInputRef} type="file" accept="image/jpeg" capture="environment" className="hidden" onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }} />
      </>
    );

    const fileGrid = files.length > 0 && (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {files.map((f, idx) => (
          <div key={idx} className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
            {f.preview ? (
              <img src={f.preview} alt="" className="h-20 w-full object-cover" />
            ) : (
              <div className="flex h-20 w-full items-center justify-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="truncate p-1 text-center text-xs">{f.file.name}</div>
            {f.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            {f.uploaded && (
              <div className="absolute left-1 top-1 rounded-full bg-green-500 px-1 text-[10px] text-white">Done</div>
            )}
            {!f.uploading && (
              <button type="button" onClick={() => removeFile(idx)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    );

    const uploadButton = files.length > 0 && !files.every(f => f.uploaded) && (
      <Button type="button" variant="outline" size="sm" onClick={uploadAll} disabled={uploading || processing}>
        {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
        Upload {files.filter(f => !f.uploaded).length} file(s)
      </Button>
    );

    if (compact) {
      return (
        <div className="relative inline-flex">
          <Button
            type="button"
            variant={files.length > 0 ? 'default' : 'outline'}
            size="icon"
            className="relative h-10 w-10"
            onClick={() => setPickerOpen((open) => !open)}
            aria-label="Add bill attachment"
            title="Add bill attachment"
          >
            {processing || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {files.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-bold text-primary">
                {files.length}
              </span>
            )}
          </Button>

          {pickerOpen && (
            <div className="absolute right-0 top-12 z-30 w-[min(86vw,380px)] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
              <div className="space-y-3">
                {controls}
                {fileGrid}
                {uploadButton}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {controls}
        {fileGrid}
        {uploadButton}
      </div>
    );
  }
);

FileUpload.displayName = 'FileUpload';

export default FileUpload;
