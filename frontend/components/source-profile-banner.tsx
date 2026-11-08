"use client";
import { Button } from "@/components/ui/button";
import {
  Database,
  Table2,
  LogOut,
  ChevronRight,
} from "lucide-react";
import type { Source } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function SourceProfileBanner({
  source,
  tableCount,
  onClose,
  onSwitchSource,
}: {
  source: Source;
  tableCount: number;
  onClose: () => void;
  onSwitchSource: () => void;
}) {
  const { t: dictionary, locale } = useT();
  const t = dictionary.workspace;

  const kindLabel =
    source.kind === "existing"
      ? "PostgreSQL"
      : source.kind.toUpperCase();

  const isAr = locale === "ar";

  return (
    <div className="source-profile-banner">
      <div className="source-profile-identity">
        <span className={`source-profile-icon ${source.kind}`}>
          <Database size={22} />
        </span>
        <div className="source-profile-info">
          <div className="source-profile-name">
            <strong><bdi>{source.schema_name}</bdi></strong>
            <span className="source-profile-kind">{kindLabel}</span>
          </div>
          <div className="source-profile-meta">
            <Table2 size={12} />
            <span>{tableCount} {isAr ? "جداول" : "tables"}</span>
            {source.filename && (
              <>
                <ChevronRight size={11} />
                <span className="source-profile-filename" dir="ltr" title={source.filename}>
                  {source.filename}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="source-profile-actions">
        <Button
          variant="ghost"
          size="plain"
          className="source-profile-switch"
          onClick={onSwitchSource}
          title={isAr ? "التبديل إلى مصدر آخر" : "Switch to another source"}
        >
          {isAr ? "تبديل المصدر" : "Switch"}
        </Button>
        <Button
          variant="ghost"
          size="plain"
          className="source-profile-close icon-button"
          onClick={onClose}
          title={isAr ? "إغلاق ملف هذا المصدر" : "Close this source profile"}
          aria-label={isAr ? "إغلاق ملف المصدر" : "Close source profile"}
        >
          <LogOut size={15} />
        </Button>
      </div>
    </div>
  );
}
