import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ShelfGrid from '@/components/shelf/ShelfGrid';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';

export default function Cabinets() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedTonerId, setSelectedTonerId] = useState('');

  const { data: cabinets = [], isLoading: loadingCabinets } = useQuery({
    queryKey: ['cabinets'],
    queryFn: () => base44.entities.Cabinet.list()
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.ShelfPosition.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const { data: toners = [], isLoading: loadingToners } = useQuery({
    queryKey: ['toners'],
    queryFn: () => base44.entities.Toner.list()
  });

  const updateTonerStock = useMutation({
    mutationFn: ({ id, stock }) => base44.entities.Toner.update(id, { stock }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toners'] })
  });

  const updatePositionMutation = useMutation({
    mutationFn: async ({ cabinet_id, row, column, toner_id }) => {
      const existing = positions.find(p => p.cabinet_id === cabinet_id && p.row === row && p.column === column);
      if (existing) {
        if (toner_id) {
          return base44.entities.ShelfPosition.update(existing.id, { toner_id });
        } else {
          return base44.entities.ShelfPosition.delete(existing.id);
        }
      } else if (toner_id) {
        return base44.entities.ShelfPosition.create({ cabinet_id, row, column, toner_id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      setSelectedCell(null);
      setSelectedTonerId('');
    }
  });

  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));

  if (loadingCabinets || loadingToners) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <Archive className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('cabinets.title')}</h1>
            <p className="text-slate-500">{t('cabinets.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-6 flex flex-col items-center">
          {cabinets.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('cabinets.empty')}</p>
            </div>
          ) : (
            cabinets.map((cabinet) => (
              <div key={cabinet.id} className="w-full max-w-md md:max-w-lg">
                <ShelfGrid
                  rows={cabinet.rows || 4}
                  columns={cabinet.columns || 6}
                  positions={positions.filter(p => p.cabinet_id === cabinet.id)}
                  toners={toners}
                  cabinetName={locationNameById.get(cabinet.location_id)
                    ? `${locationNameById.get(cabinet.location_id)} • ${cabinet.name}`
                    : cabinet.name}
                editable={isAuthenticated}
                onCellClick={isAuthenticated ? (row, column, position) => {
                  setSelectedCell({
                    row,
                    column,
                    position,
                    cabinet_id: cabinet.id
                  });
                  setSelectedTonerId(position?.toner_id || '');
                } : undefined}
              />
              </div>
            ))
          )}
        </div>

      </div>

      <Dialog open={!!selectedCell} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCell?.position?.toner_id ? t('home.removeToner') : t('home.assignToner')}
            </DialogTitle>
          </DialogHeader>
          {!selectedCell?.position?.toner_id ? (
            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                {t('home.selectTonerForSlot', {
                  row: String.fromCharCode(65 + (selectedCell?.row ?? 0)),
                  col: selectedCell?.column + 1
                })}
              </div>
              <Select value={selectedTonerId} onValueChange={setSelectedTonerId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('home.selectTonerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {toners.map((toner) => (
                    <SelectItem key={toner.id} value={toner.id}>
                      {toner.model} - {toner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              {t('home.removeConfirm')}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCell(null)}>
              {t('common.cancel')}
            </Button>
            {!selectedCell?.position?.toner_id ? (
              <Button
                onClick={() => {
                  const toner = toners.find(t => t.id === selectedTonerId);
                  if (!toner) return;
                  updatePositionMutation.mutate({
                    cabinet_id: selectedCell.cabinet_id,
                    row: selectedCell.row,
                    column: selectedCell.column,
                    toner_id: selectedTonerId
                  });
                  updateTonerStock.mutate({ id: toner.id, stock: (toner.stock || 0) + 1 });
                }}
                disabled={!selectedTonerId}
              >
                {t('home.assign')}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const toner = toners.find(t => t.id === selectedCell.position.toner_id);
                  updatePositionMutation.mutate({
                    cabinet_id: selectedCell.cabinet_id,
                    row: selectedCell.row,
                    column: selectedCell.column,
                    toner_id: null
                  });
                  if (toner) {
                    const nextStock = Math.max(0, (toner.stock || 0) - 1);
                    updateTonerStock.mutate({ id: toner.id, stock: nextStock });
                  }
                }}
              >
                {t('home.remove')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
