import { FileUpIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";

export interface FileDropZoneProps {
  disabled: boolean;
  onFiles: (files: FileList | File[]) => void;
}

export function FileDropZone({ disabled, onFiles }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
        dragOver && "border-primary bg-muted/40",
        disabled && "pointer-events-none opacity-50"
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) onFiles(e.dataTransfer.files);
      }}
    >
      <FileUpIcon className="text-muted-foreground size-6" aria-hidden />
      <div className="space-y-1">
        <p className="text-foreground text-sm">Drop files here</p>
        <p className="text-muted-foreground text-xs">
          One Evidence row per file · max 100 MB
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
      >
        Choose files
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files) {
            onFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
