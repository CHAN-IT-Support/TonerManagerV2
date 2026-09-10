import React from 'react';
import { motion } from 'framer-motion';
import { Minus, Package, Plus, Trash2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useI18n } from '@/lib/i18n';

export default function TonerCard({
  toner,
  isHighlighted,
  onSelect,
  onStockChange
}) {
  const { t } = useI18n();
  const getTonerColor = () => {
    const colors = {
      schwarz: 'from-slate-700 to-slate-900',
      cyan: 'from-cyan-400 to-cyan-600',
      magenta: 'from-pink-400 to-pink-600',
      gelb: 'from-yellow-300 to-yellow-500',
      resttonerbehälter: 'from-emerald-500 to-emerald-700'
    };
    return colors[toner?.color] || 'from-slate-400 to-slate-600';
  };

  const getTextColor = () => {
    return toner?.color === 'gelb' ? 'text-amber-900' : 'text-white';
  };

  if (!toner) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl p-4 bg-gradient-to-br shadow-xl cursor-pointer",
        getTonerColor(),
        isHighlighted && "ring-4 ring-green-400"
      )}
      onClick={onSelect}
    >
      <div className={cn("flex items-start justify-between", getTextColor())}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            {toner.color === 'resttonerbehälter' ? (
              <Trash2 className="w-6 h-6" />
            ) : (
              <Package className="w-6 h-6" />
            )}
            <span className="text-sm font-medium opacity-80">
              {toner.color === 'resttonerbehälter' ? t('common.restToner') : t('common.toner')}
            </span>
          </div>
          <h3 className="text-xl font-bold mb-1">{toner.model}</h3>
          <p className="text-sm opacity-80">{toner.name}</p>
        </div>
      </div>

      {toner.stock !== undefined && (
        <div className={cn("mt-3 pt-3 border-t border-white/20", getTextColor())}>
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm opacity-80">{t('common.stock')}</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label={`${t('common.stock')} ${t('common.decrease') || 'verringern'}`}
                disabled={toner.stock <= 0 || !onStockChange}
                onClick={(event) => {
                  event.stopPropagation();
                  onStockChange?.(Math.max(0, toner.stock - 1));
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-current transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="min-w-16 text-center text-xl font-bold">
                {toner.stock} {t('common.pieces')}
              </span>
              <button
                type="button"
                aria-label={`${t('common.stock')} ${t('common.increase') || 'erhöhen'}`}
                disabled={!onStockChange}
                onClick={(event) => {
                  event.stopPropagation();
                  onStockChange?.(toner.stock + 1);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-current transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
