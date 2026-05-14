import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, ImagePlus, X, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'application/pdf'];
const ACCEPTED_EXT = '.jpg,.jpeg,.pdf';

interface FileUploadProps {
  claimId: string;
  onFilesUploaded?: (fileIds: string[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export interface FileUploadHandle {
  uploadAll: () => Promise<string[]>;
  getFileCount: () => number;
}

const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(
  ({ claimId, onFilesUploaded, maxFiles = 10, maxSizeMB = 5 }, ref) => {
    const [files, setFiles] = useState<{ file: File; preview?: string; uploading: boolean; uploaded: boolean; path?: string }[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) return `${file.name}: Only PDF and JPEG files are allowed`;
      if (file.size > maxSizeMB * 1024 * 1024) return `${file.name}: File size exceeds ${maxSizeMB}MB limit`;
      return null;
    };

    const handleFiles = (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;
      const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
      const newFiles: typeof files = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        if (files.length + newFiles.length >= maxFiles) {
          toast.error(`Maximum ${maxFiles} files allowed`);
          break;
        }
        const file = selectedFiles[i];
        const error = validateFile(file);
        if (error) { toast.error(error); continue; }
        if (totalSize + file.size > 50 * 1024 * 1024) { toast.error('Total upload limit is 50MB'); break; }

        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        newFiles.push({ file, preview, uploading: false, uploaded: false });
      }

      setFiles(prev => [...prev, ...newFiles]);
    };

    const removeFile = (idx: number) => {
      setFiles(prev => {
        const updated = [...prev];
        if (updated[idx].preview) URL.revokeObjectURL(updated[idx].preview!);
        updated.splice(idx, 1);
        return updated;
      });
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

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="h-4 w-4 mr-1" /> Gallery
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
            <Camera className="h-4 w-4 mr-1" /> Camera
          </Button>
          <span className="text-xs text-muted-foreground">PDF, JPEG • Max {maxSizeMB}MB each</span>
        </div>

        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXT} multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        <input ref={cameraInputRef} type="file" accept="image/jpeg" capture="environment" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />

        {files.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {files.map((f, idx) => (
              <div key={idx} className="relative border border-border rounded-lg overflow-hidden bg-muted/30">
                {f.preview ? (
                  <img src={f.preview} alt="" className="w-full h-20 object-cover" />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="p-1 text-xs truncate text-center">{f.file.name}</div>
                {f.uploading && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                {f.uploaded && (
                  <div className="absolute top-1 left-1 bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">✓</div>
                )}
                {!f.uploading && (
                  <button type="button" onClick={() => removeFile(idx)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && !files.every(f => f.uploaded) && (
          <Button type="button" variant="outline" size="sm" onClick={uploadAll} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Upload {files.filter(f => !f.uploaded).length} file(s)
          </Button>
        )}
      </div>
    );
  }
);

FileUpload.displayName = 'FileUpload';

export default FileUpload;
