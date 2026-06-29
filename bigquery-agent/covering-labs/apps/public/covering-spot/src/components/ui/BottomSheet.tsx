"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="absolute bottom-0 inset-x-0 w-full max-w-[480px] mx-auto bg-bg rounded-t-2xl max-h-[75vh] flex flex-col">
        {/* Handle + Header */}
        <div className="flex-shrink-0 pt-3 px-4 pb-3 border-b border-border-light">
          <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-bg-warm text-text-muted"
            >
              ✕
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 px-4 pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
