import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Loader2, Printer } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ShelfGrid from '@/components/shelf/ShelfGrid';
import TonerCard from '@/components/toner/TonerCard';
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

  const { data: printerModels = [] } = useQuery({
    queryKey: ['printerModels'],
    queryFn: () => base44.entities.PrinterModel.list()
  });

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: () => base44.entities.Printer.list()
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

  const expandPositionMutation = useMutation({
    mutationFn: ({ cabinet_id, group, direction, toner_id }) => {
      const cells = direction === 'right'
        ? Array.from({ length: group.rowSpan }, (_, offset) => ({ row: group.row + offset, column: group.column + group.columnSpan }))
        : Array.from({ length: group.columnSpan }, (_, offset) => ({ row: group.row - 1, column: group.column + offset }));
      return Promise.all(cells.map(({ row, column }) => (
        base44.entities.ShelfPosition.create({ cabinet_id, row, column, toner_id })
      )));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] })
  });

  const shrinkPositionMutation = useMutation({
    mutationFn: ({ cabinet_id, group, direction }) => {
      const cells = direction === 'right'
        ? Array.from({ length: group.rowSpan }, (_, offset) => ({ row: group.row + offset, column: group.column + group.columnSpan - 1 }))
        : Array.from({ length: group.columnSpan }, (_, offset) => ({ row: group.row, column: group.column + offset }));
      return Promise.all(cells.map(({ row, column }) => {
        const position = positions.find(p => p.cabinet_id === cabinet_id && p.row === row && p.column === column);
        return position ? base44.entities.ShelfPosition.delete(position.id) : null;
      }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] })
  });

  const removePositionGroupMutation = useMutation({
    mutationFn: ({ cabinet_id, group }) => {
      const cells = group
        ? Array.from({ length: group.rowSpan }, (_, rowOffset) =>
          Array.from({ length: group.columnSpan }, (_, columnOffset) => ({
            row: group.row + rowOffset,
            column: group.column + columnOffset
          }))
        ).flat()
        : [];
      return Promise.all(cells.map(({ row, column }) => {
        const position = positions.find(p => p.cabinet_id === cabinet_id && p.row === row && p.column === column);
        return position ? base44.entities.ShelfPosition.delete(position.id) : null;
      }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] })
  });

  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));
  const sortedToners = [...toners].sort((a, b) => {
    const modelComparison = (a.model || '').localeCompare(b.model || '', 'de', { sensitivity: 'base' });
    return modelComparison || (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' });
  });
  const selectedToner = selectedCell?.position?.toner_id
    ? toners.find((toner) => toner.id === selectedCell.position.toner_id)
    : null;
  const compatibleModels = selectedToner
    ? printerModels.filter((model) => (model.toner_ids || []).includes(selectedToner.id))
    : [];
  const compatiblePrinters = selectedToner
    ? printers.filter((printer) => compatibleModels.some((model) => model.id === printer.printer_model_id))
    : [];

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
                  toners={sortedToners}
                  cabinetName={locationNameById.get(cabinet.location_id)
                    ? `${locationNameById.get(cabinet.location_id)} • ${cabinet.name}`
                    : cabinet.name}
                editable={isAuthenticated}
                onExpand={isAuthenticated ? (group, direction, toner) => expandPositionMutation.mutate({
                  cabinet_id: cabinet.id,
                  group,
                  direction,
                  toner_id: toner.id
                }) : undefined}
                onShrink={isAuthenticated ? (group, direction) => shrinkPositionMutation.mutate({
                  cabinet_id: cabinet.id,
                  group,
                  direction
                }) : undefined}
                onCellClick={(row, column, position, group) => {
                  if (!isAuthenticated && !position?.toner_id) return;
                  setSelectedCell({
                    row,
                    column,
                    position,
                    group,
                    cabinet_id: cabinet.id
                  });
                  setSelectedTonerId(position?.toner_id || '');
                }}
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
              {selectedCell?.position?.toner_id
                ? `${selectedToner?.model || t('common.toner')} - ${selectedToner?.name || ''}`
                : t('home.assignToner')}
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
            <div className="space-y-5">
              <TonerCard
                toner={selectedToner}
                onStockChange={(stock) => {
                  if (selectedToner) updateTonerStock.mutate({ id: selectedToner.id, stock });
                }}
              />
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                  <Printer className="h-5 w-5" />
                  {t('cabinets.compatiblePrinters')}
                </h3>
                {compatibleModels.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('cabinets.noCompatiblePrinters')}</p>
                ) : (
                  <div className="space-y-2">
                    {compatibleModels.map((model) => {
                      const modelPrinters = compatiblePrinters.filter((printer) => printer.printer_model_id === model.id);
                      return (
                        <div key={model.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="font-medium text-slate-800">{model.name}</p>
                          {modelPrinters.length > 0 && (
                            <p className="text-sm text-slate-500">
                              {modelPrinters.map((printer) => printer.name).join(', ')}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
            ) : isAuthenticated ? (
              <Button
                onClick={() => {
                  const toner = toners.find(t => t.id === selectedCell.position.toner_id);
                  removePositionGroupMutation.mutate({
                    cabinet_id: selectedCell.cabinet_id,
                    group: selectedCell.group
                  });
                  if (toner) {
                    const nextStock = Math.max(0, (toner.stock || 0) - 1);
                    updateTonerStock.mutate({ id: toner.id, stock: nextStock });
                  }
                }}
              >
                {t('home.remove')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
