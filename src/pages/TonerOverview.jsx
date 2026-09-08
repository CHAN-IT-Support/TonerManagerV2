import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ShelfGrid from '@/components/shelf/ShelfGrid';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TonerOverview() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [selectedToner, setSelectedToner] = useState(null);
  const [action, setAction] = useState(null);
  const [search, setSearch] = useState('');
  const [pendingRemove, setPendingRemove] = useState(null);
  const [stockFilter, setStockFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('');

  const { data: toners = [], isLoading: loadingToners } = useQuery({
    queryKey: ['toners'],
    queryFn: () => base44.entities.Toner.list()
  });

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

  const { data: tonerLocationSettings = [] } = useQuery({
    queryKey: ['tonerLocationSettings'],
    queryFn: () => base44.entities.TonerLocationSettings.list()
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
        }
        return base44.entities.ShelfPosition.delete(existing.id);
      }
      if (toner_id) {
        return base44.entities.ShelfPosition.create({ cabinet_id, row, column, toner_id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      setAction(null);
      setSelectedToner(null);
    }
  });

  const sortedToners = [...toners].sort((a, b) => {
    const modelA = (a.model || '').toLowerCase();
    const modelB = (b.model || '').toLowerCase();
    if (modelA === modelB) {
      return (a.name || '').localeCompare(b.name || '');
    }
    return modelA.localeCompare(modelB);
  });
  const positionsByCabinet = useMemo(() => {
    const map = new Map();
    positions.forEach((pos) => {
      if (!map.has(pos.cabinet_id)) map.set(pos.cabinet_id, []);
      map.get(pos.cabinet_id).push(pos);
    });
    return map;
  }, [positions]);

  const cabinetById = useMemo(() => {
    const map = new Map();
    cabinets.forEach((cabinet) => map.set(cabinet.id, cabinet));
    return map;
  }, [cabinets]);

  const locationSettingsByKey = useMemo(() => {
    const map = new Map();
    tonerLocationSettings.forEach((setting) => {
      map.set(`${setting.toner_id}:${setting.location_id}`, setting);
    });
    return map;
  }, [tonerLocationSettings]);

  const tonerCountByLocation = useMemo(() => {
    const map = new Map();
    positions.forEach((pos) => {
      if (!pos.toner_id) return;
      const cabinet = cabinetById.get(pos.cabinet_id);
      if (!cabinet?.location_id) return;
      const key = `${pos.toner_id}:${cabinet.location_id}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [positions, cabinetById]);

  const filteredToners = sortedToners.filter((toner) => {
    const haystack = `${toner.model || ''} ${toner.name || ''} ${toner.color || ''}`.toLowerCase();
    const matchesSearch = haystack.includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (!locationFilter) return true;
    const current = tonerCountByLocation.get(`${toner.id}:${locationFilter}`) || 0;
    const setting = locationSettingsByKey.get(`${toner.id}:${locationFilter}`);
    const minStock = setting?.min_stock || 0;
    if (stockFilter === 'zero') return current === 0;
    if (stockFilter === 'aboveMin') return current > minStock;
    if (stockFilter === 'underMin') return current < minStock;
    return true;
  });

  const visibleCabinets = useMemo(() => {
    const baseCabinets = locationFilter
      ? cabinets.filter((cabinet) => cabinet.location_id === locationFilter)
      : cabinets;
    if (!selectedToner || !action) return baseCabinets;
    if (action === 'remove') {
      return baseCabinets.filter((cabinet) => {
        const cabinetPositions = positionsByCabinet.get(cabinet.id) || [];
        return cabinetPositions.some((p) => p.toner_id === selectedToner.id);
      });
    }
    return baseCabinets.filter((cabinet) => {
      const cabinetPositions = positionsByCabinet.get(cabinet.id) || [];
      const occupied = new Set(cabinetPositions.map((p) => `${p.row}:${p.column}`));
      const rows = cabinet.rows || 4;
      const columns = cabinet.columns || 6;
      return rows * columns > occupied.size;
    });
  }, [action, cabinets, locationFilter, positionsByCabinet, selectedToner]);

  useEffect(() => {
    if (!locationFilter && locations.length > 0) {
      setLocationFilter(locations[0].id);
    }
  }, [locations, locationFilter]);

  if (loadingToners || loadingCabinets) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                <ListChecks className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">{t('tonerOverview.title')}</h1>
                <p className="text-slate-500">{t('tonerOverview.subtitle')}</p>
              </div>
            </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden print-area">
          <div className="px-4 py-3 border-b border-slate-200 bg-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('tonerOverview.searchPlaceholder')}
                className="md:max-w-sm print-hide"
              />
              <div className="flex items-center gap-2 print-hide">
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder={t('common.location')} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-3 print-hide justify-between">
              <button
                onClick={() => setStockFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  stockFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'
                }`}
              >
                {t('tonerOverview.filterAll')}
              </button>
              <button
                onClick={() => setStockFilter('zero')}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  stockFilter === 'zero' ? 'bg-amber-500 text-slate-900 border-amber-500' : 'border-slate-200 text-slate-600'
                }`}
              >
                {t('tonerOverview.filterZero')}
              </button>
              <button
                onClick={() => setStockFilter('aboveMin')}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  stockFilter === 'aboveMin' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600'
                }`}
              >
                {t('tonerOverview.filterAboveMin')}
              </button>
              <button
                onClick={() => setStockFilter('underMin')}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  stockFilter === 'underMin' ? 'bg-red-500 text-white border-red-500' : 'border-slate-200 text-slate-600'
                }`}
              >
                {t('tonerOverview.filterUnderMin')}
              </button>
              <div className="text-xs text-slate-500 ml-auto">
                {t('tonerOverview.filterCount', { filtered: filteredToners.length, total: sortedToners.length })}
              </div>
            </div>
            <div className="print-show text-sm text-slate-600 mt-2 hidden">
              {t('common.location')}: {locations.find((l) => l.id === locationFilter)?.name || '-'}
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="w-1/4 px-4 py-3 text-left">{t('tonerOverview.colModel')}</th>
                  <th className="w-2/4 px-4 py-3 text-left">{t('tonerOverview.colName')}</th>
                  <th className="w-1/6 px-4 py-3 text-left">{t('tonerOverview.colColor')}</th>
                  <th className="w-1/12 px-4 py-3 text-right" title={t('tonerOverview.colStock')}>Best.</th>
                  <th className="w-1/12 px-4 py-3 text-right" title={t('common.minStock')}>Min.</th>
                  <th className="w-1/12 px-4 py-3 text-right" title={t('common.deficit')}>Diff.</th>
                </tr>
              </thead>
              <tbody>
                {filteredToners.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-500" colSpan={6}>
                      {t('tonerOverview.noToner')}
                    </td>
                  </tr>
                ) : (
                  filteredToners.map((toner) => {
                    const locationId = locationFilter || locations[0]?.id;
                    const currentStock = locationId ? (tonerCountByLocation.get(`${toner.id}:${locationId}`) || 0) : 0;
                    const setting = locationId ? locationSettingsByKey.get(`${toner.id}:${locationId}`) : null;
                    const minStock = setting?.min_stock || 0;
                    const deficit = Math.max(0, minStock - currentStock);
                    return (
                    <tr
                      key={toner.id}
                      onClick={isAuthenticated ? () => {
                        setSelectedToner(toner);
                        setAction(null);
                      } : undefined}
                      className={`text-sm text-slate-700 border-b last:border-b-0 border-slate-100 hover:bg-slate-50 ${isAuthenticated ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800 truncate">{toner.model || '-'}</td>
                      <td className="px-4 py-3 truncate">{toner.name || '-'}</td>
                      <td className="px-4 py-3 capitalize truncate">
                        {toner.color ? t(`colors.${toner.color}`) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{currentStock}</td>
                      <td className="px-4 py-3 text-right">{minStock}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold">{deficit}</td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedToner} onOpenChange={(open) => {
        if (!open) {
          setSelectedToner(null);
          setAction(null);
          setPendingRemove(null);
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedToner ? `${selectedToner.model} - ${selectedToner.name}` : t('common.toner')}
            </DialogTitle>
          </DialogHeader>

          {!action ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {t('tonerOverview.chooseAction')}
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setAction('remove')} variant="outline">{t('tonerOverview.take')}</Button>
                <Button onClick={() => setAction('place')}>{t('tonerOverview.place')}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {action === 'place'
                  ? t('tonerOverview.placeHelp')
                  : t('tonerOverview.takeHelp')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                {visibleCabinets.map((cabinet) => (
                  <div key={cabinet.id} className="w-full">
                    <ShelfGrid
                      rows={cabinet.rows || 4}
                      columns={cabinet.columns || 6}
                      positions={positionsByCabinet.get(cabinet.id) || []}
                      toners={toners}
                      cabinetName={cabinet.name}
                      editable={isAuthenticated}
                      highlightTonerId={action === 'remove' ? selectedToner?.id : undefined}
                      onCellClick={isAuthenticated ? (row, column, position) => {
                        if (!selectedToner) return;
                        if (action === 'place') {
                          if (position?.toner_id) return;
                          updatePositionMutation.mutate({
                            cabinet_id: cabinet.id,
                            row,
                            column,
                            toner_id: selectedToner.id
                          });
                          updateTonerStock.mutate({
                            id: selectedToner.id,
                            stock: (selectedToner.stock || 0) + 1
                          });
                        } else if (action === 'remove') {
                          if (position?.toner_id !== selectedToner.id) return;
                          setPendingRemove({ cabinet, row, column });
                        }
                      } : undefined}
                    />
                  </div>
                ))}
                {visibleCabinets.length === 0 && (
                  <div className="text-sm text-slate-500">
                    {action === 'place' ? t('tonerOverview.noFreeSlots') : t('tonerOverview.notPlaced')}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedToner(null)}>
              {t('admin.close')}
            </Button>
            {action && (
              <Button onClick={() => setAction(null)} variant="outline">
                {t('common.back')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingRemove} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('home.removeToner')}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600">
            {t('home.removeConfirm')}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemove(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!pendingRemove || !selectedToner) return;
                updatePositionMutation.mutate({
                  cabinet_id: pendingRemove.cabinet.id,
                  row: pendingRemove.row,
                  column: pendingRemove.column,
                  toner_id: null
                });
                const nextStock = Math.max(0, (selectedToner.stock || 0) - 1);
                updateTonerStock.mutate({ id: selectedToner.id, stock: nextStock });
                setPendingRemove(null);
              }}
            >
              {t('home.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
