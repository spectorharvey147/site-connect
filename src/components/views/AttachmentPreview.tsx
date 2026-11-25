import { useState, useEffect, useRef, type PointerEvent, type WheelEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Image, FileText, Download, ExternalLink, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AttachmentPreviewProps {
  fileIds: string[];
  claimId: string;
  compact?: boolean;
  onRemove?: (fileId: string) => void;
}



function isImage(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
}

function isPdf(name: string) {
  return /\.pdf$/i.test(name);
}

function getFileName(fileId: string) {
  const parts = fileId.split('/');
  const storedName = parts[parts.length - 1] || fileId;
  const extension = storedName.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  const standardName = storedName.match(/^(\d+)-(\d+)(?:\.|$)/);
  const generatedName = storedName.match(/^(\d+)-[0-9a-f-]{36}-(\d+)-/i);
  const timestampAndIndex = standardName || generatedName;
  if (!timestampAndIndex) return storedName;
  return `${timestampAndIndex[1]}-${timestampAndIndex[2]}${extension ? `.${extension}` : ''}`;
}

export default function AttachmentPreview({ fileIds, compact = false, onRemove }: AttachmentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | 'other'>('other');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [imageDragging, setImageDragging] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(100);
  const previewObjectUrl = useRef<string | null>(null);
  const previewRequestId = useRef(0);
  const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);

  const [signedUrls, setSignedUrls] = useState<Record<string,string>>({});
  const fileKey = JSON.stringify(fileIds || []);
  useEffect(() => {
    let cancelled=false;
    const paths: string[] = JSON.parse(fileKey);
    setSignedUrls({});
    if(paths.length) supabase.storage.from('claim-attachments').createSignedUrls(paths,3600).then(({data,error}: {data?:{path:string;signedUrl:string}[];error?:unknown}) => {
      if(cancelled) return;
      if(error) { toast.error('Unable to load attachment previews'); return; }
      setSignedUrls(Object.fromEntries((data || []).map(row=>[row.path,row.signedUrl])));
    }).catch(()=>{if(!cancelled) toast.error('Unable to load attachment previews');});
    return ()=>{cancelled=true;};
  },[fileKey]);

  if (!fileIds || fileIds.length === 0) {
    return <p className="text-sm italic text-muted-foreground">No attachments</p>;
  }

  const openPreview = async (fileId: string) => {
    const url = signedUrls[fileId] || '';
    if (!url) { toast.error('Attachment is still loading or access was denied'); return; }
    const requestId = ++previewRequestId.current;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = null;
    const type = isImage(fileId) ? 'image' : isPdf(fileId) ? 'pdf' : 'other';
    setPreviewType(type);
    setPreviewFileId(fileId);
    setPreviewUrl(type === 'pdf' ? null : url);
    setPreviewError('');
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
    setPdfZoom(100);

    if (type !== 'pdf') return;

    setPreviewLoading(true);
    try {
      // Load the private PDF through Supabase and embed a local blob URL. This
      // avoids frame restrictions on the signed storage URL and keeps the PDF
      // viewer's built-in scrolling and zoom controls available.
      const { data, error } = await supabase.storage.from('claim-attachments').download(fileId);
      if (error || !data) throw error || new Error('PDF download failed');
      if (requestId !== previewRequestId.current) return;
      const objectUrl = URL.createObjectURL(data);
      previewObjectUrl.current = objectUrl;
      setPreviewUrl(objectUrl);
    } catch (error) {
      if (requestId !== previewRequestId.current) return;
      console.error('PDF preview failed:', error);
      setPreviewError('Could not load the PDF preview. You can still download the file.');
    } finally {
      if (requestId === previewRequestId.current) setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    previewRequestId.current += 1;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = null;
    setPreviewLoading(false);
    setPreviewError('');
    setPreviewUrl(null);
    setPreviewFileId(null);
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
    setImageDragging(false);
    lastPointerPosition.current = null;
  };

  useEffect(() => () => {
    previewRequestId.current += 1;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  const changeImageZoom = (amount: number) => {
    const nextZoom = Math.min(5, Math.max(0.5, imageZoom + amount));
    setImageZoom(nextZoom);
    if (nextZoom <= 1) setImageOffset({ x: 0, y: 0 });
  };

  const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeImageZoom(event.deltaY < 0 ? 0.15 : -0.15);
  };

  const handleImagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (imageZoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointerPosition.current = { x: event.clientX, y: event.clientY };
    setImageDragging(true);
  };

  const handleImagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = lastPointerPosition.current;
    if (!imageDragging || !last) return;
    setImageOffset((offset) => ({ x: offset.x + event.clientX - last.x, y: offset.y + event.clientY - last.y }));
    lastPointerPosition.current = { x: event.clientX, y: event.clientY };
  };

  const handleImagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    lastPointerPosition.current = null;
    setImageDragging(false);
  };

  const resetImageView = () => {
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
  };

  const changePdfZoom = (amount: number) => setPdfZoom((zoom) => Math.min(300, Math.max(50, zoom + amount)));

  const downloadFile = async (fileId: string) => {
    try {
      const { data, error } = await supabase.storage.from('claim-attachments').download(fileId);
      if (error || !data) throw error || new Error('Download failed');

      const objectUrl = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = getFileName(fileId);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error('Attachment download failed:', error);
      toast.error('Attachment download failed');
    }
  };

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" asChild>
        <a href={previewUrl || ''} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-4 w-4" /> Open
        </a>
      </Button>
      <Button variant="outline" onClick={() => previewFileId && void downloadFile(previewFileId)}>
        <Download className="mr-1 h-4 w-4" /> Download
      </Button>
      <Button variant="outline" onClick={closePreview}>Close</Button>
    </div>
  );

  return (
    <div>
      {!compact && (
        <h4 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          <Image className="h-4 w-4" /> Attachments ({fileIds.length})
        </h4>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {fileIds.map((fileId) => {
          const url = signedUrls[fileId] || '';
          const name = getFileName(fileId);
          const imageFile = isImage(fileId);

          return (
            <div
              key={fileId}
              className="group relative overflow-hidden rounded-lg border border-border transition-all hover:ring-2 hover:ring-primary/50"
            >
              <div className="cursor-pointer" onClick={() => void openPreview(fileId)}>
                {imageFile && url ? (
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img src={url} alt={name} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  </div>
                ) : (
                  <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted/30 p-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="truncate border-t border-border px-2 py-1 text-center text-xs text-muted-foreground" title={name}>{name}</p>
              <div className={`absolute bottom-7 left-0 right-0 flex justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-1 transition-opacity ${onRemove ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-10 w-10 bg-white/90 hover:bg-white md:h-7 md:w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    void downloadFile(fileId);
                  }}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {onRemove && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-10 w-10 md:h-7 md:w-7"
                    onClick={(e) => { e.stopPropagation(); onRemove(fileId); }}
                    title="Remove attachment from this claim"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!previewFileId}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-h-[92svh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attachment Preview</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[72vh] min-h-48 flex-col items-center gap-3 overflow-auto">
            {previewType === 'image' && previewUrl && (
              <>
                <div className="flex w-full items-center justify-end gap-2">
                  <span className="mr-auto text-xs text-muted-foreground">Scroll to zoom · Drag to pan when zoomed</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Zoom out" onClick={() => changeImageZoom(-0.25)} disabled={imageZoom <= 0.5}><ZoomOut className="h-4 w-4" /></Button>
                  <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(imageZoom * 100)}%</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Zoom in" onClick={() => changeImageZoom(0.25)} disabled={imageZoom >= 5}><ZoomIn className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Reset image zoom" onClick={resetImageView}><RotateCcw className="h-4 w-4" /></Button>
                </div>
                <div
                  className={`flex min-h-40 w-full flex-1 items-center justify-center overflow-hidden rounded bg-muted/20 ${imageZoom > 1 ? (imageDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
                  onWheel={handleImageWheel}
                  onPointerDown={handleImagePointerDown}
                  onPointerMove={handleImagePointerMove}
                  onPointerUp={handleImagePointerUp}
                  onPointerCancel={handleImagePointerUp}
                  style={{ touchAction: 'none' }}
                >
                  <img
                    src={previewUrl}
                    alt={getFileName(previewFileId || '')}
                    draggable={false}
                    className="max-h-[62vh] max-w-full select-none rounded object-contain"
                    style={{ transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoom})`, transformOrigin: 'center', transition: imageDragging ? 'none' : 'transform 120ms ease-out' }}
                  />
                </div>
              </>
            )}
            {previewType === 'pdf' && previewLoading && (
              <div className="p-8 text-sm text-muted-foreground" role="status">Loading PDF preview…</div>
            )}
            {previewType === 'pdf' && previewError && (
              <div className="p-8 text-center" role="alert">
                <p className="text-sm text-destructive">{previewError}</p>
                {previewFileId && <Button type="button" variant="outline" className="mt-3" onClick={() => void downloadFile(previewFileId)}><Download className="mr-1 h-4 w-4" />Download PDF</Button>}
              </div>
            )}
            {previewType === 'pdf' && previewUrl && !previewLoading && (
              <div className="flex min-h-[65vh] w-full flex-col gap-2">
                <div className="flex items-center justify-end gap-2">
                  <span className="mr-auto text-xs text-muted-foreground">Scroll inside the document to move through pages</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Zoom out PDF" onClick={() => changePdfZoom(-25)} disabled={pdfZoom <= 50}><ZoomOut className="h-4 w-4" /></Button>
                  <span className="min-w-12 text-center text-xs tabular-nums">{pdfZoom}%</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Zoom in PDF" onClick={() => changePdfZoom(25)} disabled={pdfZoom >= 300}><ZoomIn className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Reset PDF zoom" onClick={() => setPdfZoom(100)}><RotateCcw className="h-4 w-4" /></Button>
                </div>
                <iframe src={`${previewUrl}#toolbar=1&navpanes=1&scrollbar=1&zoom=${pdfZoom}`} className="min-h-[60vh] w-full flex-1 rounded border bg-white" title={`Preview of ${getFileName(previewFileId || '')}`} />
              </div>
            )}
            {previewType === 'other' && (
              <div className="p-8 text-center">
                <FileText className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                <p className="text-muted-foreground">Preview not available for this file type.</p>
                <Button variant="outline" className="mt-4" onClick={() => previewFileId && void downloadFile(previewFileId)}>
                  <Download className="mr-1 h-4 w-4" /> Download File
                </Button>
              </div>
            )}
          </div>
          {previewUrl && !previewLoading && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
