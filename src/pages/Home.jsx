import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Printer, Loader2, Package } from 'lucide-react';
import { Button } from "@/components/ui/button";
import PrinterSelector from '@/components/printer/PrinterSelector';
import ShelfGrid from '@/components/shelf/ShelfGrid';
import TonerCard from '@/components/toner/TonerCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedTonerId, setSelectedTonerId] = useState('');
  const [activeTonerId, setActiveTonerId] = useState(null);
  const [activePosition, setActivePosition] = useState(null);

  const { data: printers = [], isLoading: loadingPrinters } = useQuery({
    queryKey: ['printers'],
    queryFn: () => base44.entities.Printer.list()
  });

  const { data: toners = [], isLoading: loadingToners } = useQuery({
    queryKey: ['toners'],
    queryFn: () => base44.entities.Toner.list()
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => base44.entities.Manufacturer.list()
  });

  const { data: printerModels = [] } = useQuery({
    queryKey: ['printerModels'],
    queryFn: () => base44.entities.PrinterModel.list()
  });

  const { data: cabinets = [] } = useQuery({
    queryKey: ['cabinets'],
    queryFn: () => base44.entities.Cabinet.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.ShelfPosition.list()
  });

  // Get toners for selected printer via PrinterModel
  const getTonersForPrinter = (printer) => {
    const printerModel = printerModels.find((m) => m.id === printer?.printer_model_id);
    if (!printerModel?.toner_ids || printerModel.toner_ids.length === 0) return [];
    return printerModel.toner_ids.map((id) => toners.find((t) => t.id === id)).filter(Boolean);
  };

  // Get display info for printer
  const getPrinterDisplayInfo = (printer) => {
    const printerModel = printerModels.find((m) => m.id === printer?.printer_model_id);
    const manufacturer = manufacturers.find((m) => m.id === printerModel?.manufacturer_id);
    return {
      modelName: printerModel?.name || '',
      manufacturerName: manufacturer?.name || ''
    };
  };

  // Prepare printers with display info for selector
  const locationNameById = useMemo(() => {
    const map = new Map();
    locations.forEach((location) => map.set(location.id, location.name));
    return map;
  }, [locations]);

  const sortedToners = [...toners].sort((a, b) => {
    const modelComparison = (a.model || '').localeCompare(b.model || '', 'de', { sensitivity: 'base' });
    return modelComparison || (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' });
  });

  const printersWithInfo = printers.map((p) => {
    const info = getPrinterDisplayInfo(p);
    const printerModel = printerModels.find((m) => m.id === p.printer_model_id);
    return {
      ...p,
      model: `${info.manufacturerName} ${info.modelName}`.trim(),
      model_name: info.modelName || '',
      manufacturer_name: info.manufacturerName || '',
      image_url: printerModel?.image_url,
      location_name: locationNameById.get(p.location_id) || ''
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const queryClient = useQueryClient();

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

  const selectedToners = selectedPrinter ? getTonersForPrinter(selectedPrinter) : [];

  const positionsByToner = useMemo(() => {
    const map = new Map();
    positions.forEach((pos) => {
      if (!map.has(pos.toner_id)) map.set(pos.toner_id, []);
      map.get(pos.toner_id).push(pos);
    });
    return map;
  }, [positions]);

  const cabinetNameById = useMemo(() => {
    const map = new Map();
    cabinets.forEach((cabinet) => map.set(cabinet.id, cabinet.name));
    return map;
  }, [cabinets]);

  const highlightTonerIds = activePosition
    ? []
    : (activeTonerId ? [activeTonerId] : selectedToners.map((toner) => toner.id));
  const visibleCabinets = selectedPrinter?.location_id
    ? cabinets.filter((cabinet) => cabinet.location_id === selectedPrinter.location_id)
    : cabinets;

  const isLoading = loadingPrinters || loadingToners;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>);

  }

  const selectedPrinterInfo = selectedPrinter ? getPrinterDisplayInfo(selectedPrinter) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8">

          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4" style={{ backgroundColor: '#FFCB00' }}>
            <Printer className="w-8 h-8 text-slate-800" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{t('home.title')}</h1>
          <p className="text-slate-500 mt-1">{t('home.subtitle')}</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!selectedPrinter ?
          <motion.div
            key="selector"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -50 }}>

              <PrinterSelector
              printers={printersWithInfo}
              onSelect={(printer) => {
                setSelectedPrinter(printer);
                setActiveTonerId(null);
                setActivePosition(null);
              }}
              searchValue={searchValue}
              onSearchChange={setSearchValue} />

            </motion.div> :

          <motion.div
            key="result"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6">

              <Button
              variant="ghost"
              onClick={() => {
                setSelectedPrinter(null);
                setActiveTonerId(null);
                setActivePosition(null);
              }}
              className="flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900">

                <ArrowLeft className="w-4 h-4" />
                {t('home.backToSelection')}
              </Button>

              {/* Ausgewählter Drucker */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
                {selectedPrinter?.image_url && (
                  <img
                    src={selectedPrinter.image_url}
                    alt={selectedPrinterInfo?.modelName || selectedPrinter.name}
                    className="w-16 h-16 rounded-lg object-cover border border-slate-100"
                  />
                )}
                <div>
                <div className="text-sm text-slate-500 mb-1">{t('home.yourPrinter')}</div>
                  <div className="font-semibold text-lg text-slate-800">{selectedPrinter.name}</div>
                  <div className="text-sm text-slate-600">
                    {selectedPrinterInfo?.manufacturerName} {selectedPrinterInfo?.modelName}
                  </div>
                  {selectedPrinter.location_name && (
                    <div className="text-xs text-slate-500 mt-1">
                      {t('common.location')}: {selectedPrinter.location_name}
                    </div>
                  )}
                </div>
              </div>

              {/* Toner Info */}
              {selectedToners.length > 0 ?
            <>
                  <div className="space-y-4">
                      {selectedToners.map((toner) => {
                        const tonerPositions = positionsByToner.get(toner.id) || [];
                        const isActive = activeTonerId === toner.id;
                        return (
                          <TonerCard
                            key={toner.id}
                            toner={toner}
                            isHighlighted={isActive}
                            onStockChange={(stock) => updateTonerStock.mutate({ id: toner.id, stock })}
                            onSelect={() => {
                              setActiveTonerId(toner.id);
                              setActivePosition(null);
                            }}
                          />
                        );
                      })}
                  </div>

                  {/* Schrank-Ansicht */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-600 mb-3 text-center">
                      {t('home.positionInCabinet')}
                    </h3>
                    <div className="space-y-4 flex flex-col items-center">
                      {visibleCabinets.map(cabinet => (
                        <div key={cabinet.id} className="w-full max-w-md md:max-w-lg">
                          <ShelfGrid
                            rows={cabinet.rows || 4}
                            columns={cabinet.columns || 6}
                            positions={positions.filter(p => p.cabinet_id === cabinet.id)}
                            toners={sortedToners}
                            highlightTonerIds={highlightTonerIds}
                            highlightCell={activePosition?.cabinet_id === cabinet.id ? { row: activePosition.row, column: activePosition.column } : null}
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
                            onCellClick={isAuthenticated ? (row, column, position, group) => {
                              setSelectedCell({
                                row,
                                column,
                                position,
                                group,
                                cabinet_id: cabinet.id
                              });
                              setSelectedTonerId(position?.toner_id || '');
                            } : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </> :

            <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
                  <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-500">{t('home.noTonerTitle')}</p>
                  <p className="text-sm text-slate-400 mt-1">{t('home.noTonerSubtitle')}</p>
                </div>
            }
            </motion.div>
          }
        </AnimatePresence>
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
                  {sortedToners.map((toner) => (
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
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);

}
