import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Settings, Package, Printer, Grid3X3, Plus, Trash2, 
  Loader2, Edit, Building2, Cpu, Archive, Users
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from '@/lib/i18n';
import ShelfGrid from '@/components/shelf/ShelfGrid';
import ImageUpload from '@/components/common/ImageUpload';
import { cn } from "@/lib/utils";

export default function Admin() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('settings');
  const [selectedCell, setSelectedCell] = useState(null);
  
  // Dialog states
  const [showTonerDialog, setShowTonerDialog] = useState(false);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [showManufacturerDialog, setShowManufacturerDialog] = useState(false);
  const [showPrinterModelDialog, setShowPrinterModelDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'user' });
  const [userRoleEdits, setUserRoleEdits] = useState({});
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  
  // Edit states
  const [editingToner, setEditingToner] = useState(null);
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [editingManufacturer, setEditingManufacturer] = useState(null);
  const [editingPrinterModel, setEditingPrinterModel] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editingLocationSettings, setEditingLocationSettings] = useState({});
  
  // New entity states
  const [newToner, setNewToner] = useState({ model: '', name: '', color: 'schwarz', stock: 0, image_url: '' });
  const [newPrinter, setNewPrinter] = useState({ name: '', printer_model_id: '', location_id: '' });
  const [newManufacturer, setNewManufacturer] = useState({ name: '', logo_url: '' });
  const [newPrinterModel, setNewPrinterModel] = useState({ name: '', manufacturer_id: '', toner_ids: [], image_url: '' });
  const [newLocation, setNewLocation] = useState({ name: '' });

  // Queries
  const { data: toners = [], isLoading: loadingToners } = useQuery({
    queryKey: ['toners'],
    queryFn: () => base44.entities.Toner.list()
  });

  const { data: printers = [], isLoading: loadingPrinters } = useQuery({
    queryKey: ['printers'],
    queryFn: () => base44.entities.Printer.list()
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

  const { data: tonerLocationSettings = [] } = useQuery({
    queryKey: ['tonerLocationSettings'],
    queryFn: () => base44.entities.TonerLocationSettings.list()
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.ShelfPosition.list()
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.users.list()
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Settings konnten nicht geladen werden');
      }
      return response.json();
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates) => {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error('Settings konnten nicht gespeichert werden');
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] })
  });

  const [selectedCabinetId, setSelectedCabinetId] = useState(null);
  const selectedCabinet = cabinets.find(c => c.id === selectedCabinetId) || cabinets[0];
  
  // Set initial cabinet when loaded
  React.useEffect(() => {
    if (cabinets.length > 0 && !selectedCabinetId) {
      setSelectedCabinetId(cabinets[0].id);
    }
  }, [cabinets, selectedCabinetId]);

  useEffect(() => {
    if (!editingToner) return;
    const settingsMap = {};
    locations.forEach((location) => {
      const existing = tonerLocationSettings.find(
        (setting) => setting.toner_id === editingToner.id && setting.location_id === location.id
      );
      settingsMap[location.id] = {
        id: existing?.id,
        min_stock: existing?.min_stock ?? 0
      };
    });
    setEditingLocationSettings(settingsMap);
  }, [editingToner, locations, tonerLocationSettings]);

  // Toner Mutations
  const createTonerMutation = useMutation({
    mutationFn: (data) => base44.entities.Toner.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['toners'] });
      setShowTonerDialog(false);
      setNewToner({ model: '', name: '', color: 'schwarz', stock: 0, image_url: '' });
    }
  });

  const saveLocationSettings = async (tonerId) => {
    const updates = Object.entries(editingLocationSettings);
    if (updates.length === 0) return;
    await Promise.all(updates.map(async ([locationId, values]) => {
      const payload = {
        toner_id: tonerId,
        location_id: locationId,
        min_stock: Number(values?.min_stock) || 0
      };
      if (values?.id) {
        return base44.entities.TonerLocationSettings.update(values.id, payload);
      }
      return base44.entities.TonerLocationSettings.create(payload);
    }));
    queryClient.invalidateQueries({ queryKey: ['tonerLocationSettings'] });
  };

  const updateTonerMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Toner.update(id, data),
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['toners'] });
      if (variables?.id) {
        await saveLocationSettings(variables.id);
      }
      setEditingToner(null);
    }
  });

  const deleteTonerMutation = useMutation({
    mutationFn: (id) => base44.entities.Toner.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toners'] })
  });

  // Manufacturer Mutations
  const createManufacturerMutation = useMutation({
    mutationFn: (data) => base44.entities.Manufacturer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
      setShowManufacturerDialog(false);
      setNewManufacturer({ name: '', logo_url: '' });
    }
  });

  const updateManufacturerMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Manufacturer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
      setEditingManufacturer(null);
    }
  });

  const deleteManufacturerMutation = useMutation({
    mutationFn: (id) => base44.entities.Manufacturer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['manufacturers'] })
  });

  // PrinterModel Mutations
  const createPrinterModelMutation = useMutation({
    mutationFn: (data) => base44.entities.PrinterModel.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printerModels'] });
      setShowPrinterModelDialog(false);
      setNewPrinterModel({ name: '', manufacturer_id: '', toner_ids: [], image_url: '' });
    }
  });

  const updatePrinterModelMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PrinterModel.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printerModels'] });
      setEditingPrinterModel(null);
    }
  });

  const deletePrinterModelMutation = useMutation({
    mutationFn: (id) => base44.entities.PrinterModel.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['printerModels'] })
  });

  // Printer Mutations
  const createPrinterMutation = useMutation({
    mutationFn: (data) => base44.entities.Printer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] });
      setShowPrinterDialog(false);
      setNewPrinter({ name: '', printer_model_id: '', location_id: '' });
    }
  });

  const createLocationMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setShowLocationDialog(false);
      setNewLocation({ name: '' });
    }
  });

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Location.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setEditingLocation(null);
    }
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (id) => base44.entities.Location.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locations'] })
  });

  const updatePrinterMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Printer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] });
      setEditingPrinter(null);
    }
  });

  const deletePrinterMutation = useMutation({
    mutationFn: (id) => base44.entities.Printer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['printers'] })
  });

  // Cabinet Mutations
  const createCabinetMutation = useMutation({
    mutationFn: (data) => base44.entities.Cabinet.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cabinets'] })
  });

  const updateCabinetMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cabinet.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cabinets'] })
  });

  const deleteCabinetMutation = useMutation({
    mutationFn: (id) => base44.entities.Cabinet.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cabinets'] })
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      setSelectedCell(null);
    }
  });

  const createUserMutation = useMutation({
    mutationFn: (data) => base44.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setNewUser({ email: '', password: '', role: 'user' });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => base44.users.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setResetUser(null);
      setResetPassword('');
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.users.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  });

  const handleCellClick = (row, column, position, group) => {
    setSelectedCell({ row, column, position, group, toner_id: position?.toner_id || '', cabinet_id: selectedCabinet?.id });
  };

  // Helper functions
  const getManufacturerName = (id) => manufacturers.find(m => m.id === id)?.name || '';
  const getTonerName = (id) => {
    const toner = toners.find(t => t.id === id);
    return toner ? `${toner.model} - ${toner.name}` : '';
  };
  const getPrinterModelInfo = (id) => {
    const model = printerModels.find(m => m.id === id);
    if (!model) return { name: '', manufacturer: '' };
    return { 
      name: model.name, 
      manufacturer: getManufacturerName(model.manufacturer_id)
    };
  };

  if (loadingToners || loadingPrinters) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('admin.title')}</h1>
            <p className="text-slate-500">{t('admin.subtitle')}</p>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-8 mb-6">
            <TabsTrigger value="settings" className="flex items-center gap-1 text-xs">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabSettings')}</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1 text-xs">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabUsers')}</span>
            </TabsTrigger>
            <TabsTrigger value="locations" className="flex items-center gap-1 text-xs">
              <Grid3X3 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabLocations')}</span>
            </TabsTrigger>
            <TabsTrigger value="shelf" className="flex items-center gap-1 text-xs">
              <Archive className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabCabinets')}</span>
            </TabsTrigger>
            <TabsTrigger value="manufacturers" className="flex items-center gap-1 text-xs">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabManufacturers')}</span>
            </TabsTrigger>
            <TabsTrigger value="models" className="flex items-center gap-1 text-xs">
              <Cpu className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabModels')}</span>
            </TabsTrigger>
            <TabsTrigger value="toners" className="flex items-center gap-1 text-xs">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabToners')}</span>
            </TabsTrigger>
            <TabsTrigger value="printers" className="flex items-center gap-1 text-xs">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.tabPrinters')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Benutzer Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{t('admin.usersTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>{t('admin.userEmail')}</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="user@firma.ch"
                    />
                  </div>
                  <div>
                    <Label>{t('admin.userPassword')}</Label>
                    <Input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder={t('admin.userPassword')}
                    />
                  </div>
                  <div>
                    <Label>{t('admin.userRole')}</Label>
                    <Select
                      value={newUser.role}
                      onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('admin.userRole')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t('admin.roleUser')}</SelectItem>
                        <SelectItem value="admin">{t('admin.roleAdmin')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={() => createUserMutation.mutate(newUser)}
                  disabled={!newUser.email || !newUser.password || createUserMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('admin.userCreate')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('admin.usersTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {users.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('admin.usersEmpty')}</p>
                  </div>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-3 bg-white rounded-xl p-4 border border-slate-100 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="font-medium text-slate-800">{user.email}</div>
                        <div className="text-sm text-slate-500">{t('admin.userRole')}: {user.role}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Select
                          value={userRoleEdits[user.id] ?? user.role}
                          onValueChange={(value) =>
                            setUserRoleEdits((prev) => ({ ...prev, [user.id]: value }))
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">{t('admin.roleUser')}</SelectItem>
                            <SelectItem value="admin">{t('admin.roleAdmin')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateUserMutation.mutate({
                            id: user.id,
                            data: { role: userRoleEdits[user.id] ?? user.role }
                          })}
                        >
                          {t('common.save')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResetUser(user);
                            setResetPassword('');
                          }}
                        >
                          {t('admin.userReset')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteUserMutation.mutate(user.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('admin.settingsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-800">{t('admin.settingsAuthTitle')}</div>
                    <div className="text-sm text-slate-500">
                      {t('admin.settingsAuthDesc')}
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(settings?.require_auth_for_stock)}
                    onCheckedChange={(checked) => updateSettingsMutation.mutate({ require_auth_for_stock: checked })}
                  />
                </div>
                <div className="text-xs text-slate-500">
                  {t('admin.settingsAuthDefault')}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locations" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('admin.locationsTitle')}</h2>
              <Button onClick={() => setShowLocationDialog(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('admin.locationCreate')}
              </Button>
            </div>

            <div className="space-y-2">
              {locations.map((location) => (
                <motion.div
                  key={location.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Grid3X3 className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{location.name}</div>
                    <div className="text-sm text-slate-500">
                      {printers.filter(p => p.location_id === location.id).length} {t('admin.tabPrinters')} · {cabinets.filter(c => c.location_id === location.id).length} {t('admin.tabCabinets')}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingLocation(location)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteLocationMutation.mutate(location.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </motion.div>
              ))}

              {locations.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Grid3X3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('admin.locationsEmpty')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Schränke Tab */}
          <TabsContent value="shelf" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{t('admin.cabinetsTitle')}</CardTitle>
                <Button 
                  size="sm"
                  onClick={() => createCabinetMutation.mutate({ 
                    name: `${t('admin.cabinetDefaultName')} ${cabinets.length + 1}`, 
                    rows: 4, 
                    columns: 6,
                    location_id: locations[0]?.id || null
                  })}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('admin.cabinetNew')}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {cabinets.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('admin.cabinetsEmpty')}</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {cabinets.map((cabinet) => (
                      <Button
                        key={cabinet.id}
                        variant={selectedCabinetId === cabinet.id ? "default" : "outline"}
                        onClick={() => setSelectedCabinetId(cabinet.id)}
                      >
                        {cabinet.name}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedCabinet && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('admin.tabCabinets')}: {selectedCabinet.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label>{t('admin.cabinetName')}</Label>
                        <Input
                          value={selectedCabinet.name}
                          onChange={(e) => updateCabinetMutation.mutate({ 
                            id: selectedCabinet.id, 
                            data: { name: e.target.value }
                          })}
                        />
                      </div>
                      <div>
                        <Label>{t('admin.printerLocation')}</Label>
                        <Select
                          value={selectedCabinet.location_id || ''}
                          onValueChange={(value) => updateCabinetMutation.mutate({ 
                            id: selectedCabinet.id, 
                            data: { location_id: value || null }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('admin.selectLocation')} />
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
                      <div>
                        <Label>{t('admin.cabinetRows')}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={selectedCabinet.rows || 4}
                          onChange={(e) => updateCabinetMutation.mutate({ 
                            id: selectedCabinet.id, 
                            data: { rows: parseInt(e.target.value) || 1 }
                          })}
                        />
                      </div>
                      <div>
                        <Label>{t('admin.cabinetColumns')}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          value={selectedCabinet.columns || 6}
                          onChange={(e) => updateCabinetMutation.mutate({ 
                            id: selectedCabinet.id, 
                            data: { columns: parseInt(e.target.value) || 1 }
                          })}
                        />
                      </div>
                    </div>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        deleteCabinetMutation.mutate(selectedCabinet.id);
                        setSelectedCabinetId(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {t('admin.cabinetDelete')}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('admin.cabinetPositions')}</CardTitle>
                    <p className="text-sm text-slate-500">{t('admin.cabinetPositionsHelp')}</p>
                  </CardHeader>
                  <CardContent>
                    <ShelfGrid
                      rows={selectedCabinet.rows || 4}
                      columns={selectedCabinet.columns || 6}
                      positions={positions.filter(p => p.cabinet_id === selectedCabinet.id)}
                      toners={toners}
                      onCellClick={handleCellClick}
                      onExpand={(group, direction, toner) => expandPositionMutation.mutate({
                        cabinet_id: selectedCabinet.id,
                        group,
                        direction,
                        toner_id: toner.id
                      })}
                      onShrink={(group, direction) => shrinkPositionMutation.mutate({
                        cabinet_id: selectedCabinet.id,
                        group,
                        direction
                      })}
                      editable
                      cabinetName={selectedCabinet.name}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Hersteller Tab */}
          <TabsContent value="manufacturers" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('admin.manufacturersTitle')}</h2>
              <Button onClick={() => setShowManufacturerDialog(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('admin.manufacturerNew')}
              </Button>
            </div>

            <div className="space-y-2">
              {manufacturers.map((manufacturer) => {
                const modelCount = printerModels.filter(m => m.manufacturer_id === manufacturer.id).length;
                return (
                  <motion.div
                    key={manufacturer.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-4"
                  >
                    {manufacturer.logo_url ? (
                      <img src={manufacturer.logo_url} alt={manufacturer.name} className="w-10 h-10 rounded-lg object-contain" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{manufacturer.name}</div>
                      <div className="text-sm text-slate-500">{t('admin.modelsCount', { count: modelCount })}</div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditingManufacturer(manufacturer)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteManufacturerMutation.mutate(manufacturer.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </motion.div>
                );
              })}

              {manufacturers.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('admin.manufacturerEmpty')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Drucker-Modelle Tab */}
          <TabsContent value="models" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('admin.modelsTitle')}</h2>
              <Button onClick={() => setShowPrinterModelDialog(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('admin.modelsNew')}
              </Button>
            </div>

            <div className="space-y-2">
              {manufacturers.map((manufacturer) => {
                const models = printerModels.filter(m => m.manufacturer_id === manufacturer.id);
                if (models.length === 0) return null;
                
                return (
                  <div key={manufacturer.id} className="space-y-2">
                    <h3 className="text-sm font-medium text-slate-500 mt-4">{manufacturer.name}</h3>
                    {models.map((model) => {
                      const modelToners = (model.toner_ids || []).map(id => toners.find(t => t.id === id)).filter(Boolean);
                      return (
                        <motion.div
                          key={model.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-4"
                        >
                          {model.image_url ? (
                            <img src={model.image_url} alt={model.name} className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                              <Cpu className="w-5 h-5 text-purple-600" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{model.name}</div>
                            {modelToners.length > 0 && (
                              <div className="text-sm text-slate-500">
                                {t('common.toner')}: {modelToners.map(t => t.model).join(', ')}
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setEditingPrinterModel(model)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deletePrinterModelMutation.mutate(model.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })}

              {printerModels.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Cpu className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('admin.modelsEmpty')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Toner Tab */}
          <TabsContent value="toners" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('admin.tonersTitle')}</h2>
              <Button onClick={() => setShowTonerDialog(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('admin.tonersNew')}
              </Button>
            </div>

            <div className="space-y-2">
              {toners.map((toner) => (
                <motion.div
                  key={toner.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-4"
                >
                  {toner.image_url ? (
                    <img src={toner.image_url} alt={toner.model} className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      toner.color === 'schwarz' && "bg-slate-800",
                      toner.color === 'cyan' && "bg-cyan-500",
                      toner.color === 'magenta' && "bg-pink-500",
                      toner.color === 'gelb' && "bg-yellow-400"
                    )}>
                      <Package className={cn(
                        "w-5 h-5",
                        toner.color === 'gelb' ? 'text-amber-900' : 'text-white'
                      )} />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{toner.model}</div>
                    <div className="text-sm text-slate-500">{toner.name}</div>
                  </div>
                  <div className="text-sm text-slate-600">
                    {t('common.stock')}: {toner.stock || 0}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingToner(toner)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteTonerMutation.mutate(toner.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </motion.div>
              ))}

              {toners.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('admin.tonersEmpty')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Drucker Tab */}
          <TabsContent value="printers" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('admin.printersTitle')}</h2>
              <Button onClick={() => setShowPrinterDialog(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('admin.printersNew')}
              </Button>
            </div>

            <div className="space-y-2">
              {printers.map((printer) => {
                const modelInfo = getPrinterModelInfo(printer.printer_model_id);
                return (
                  <motion.div
                    key={printer.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-4"
                  >
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Printer className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{printer.name}</div>
                        <div className="text-sm text-slate-500">
                        {modelInfo.manufacturer} {modelInfo.name}
                      </div>
                      {locations.find(l => l.id === printer.location_id)?.name && (
                        <div className="text-xs text-slate-400">
                          {t('common.location')}: {locations.find(l => l.id === printer.location_id)?.name}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditingPrinter(printer)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deletePrinterMutation.mutate(printer.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </motion.div>
                );
              })}

              {printers.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Printer className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('admin.printersEmpty')}</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Cell Assignment Dialog */}
        <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('home.selectTonerForSlot', {
                  row: String.fromCharCode(65 + (selectedCell?.row ?? 0)),
                  col: (selectedCell?.column ?? 0) + 1
                })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('home.assignToner')}</Label>
                <Select
                  value={selectedCell?.toner_id || 'none'}
                  onValueChange={(value) => setSelectedCell({
                    ...selectedCell,
                    toner_id: value === 'none' ? '' : value
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('home.selectTonerPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.none')}</SelectItem>
                    {toners.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.model} - {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedCell(null)}>{t('common.cancel')}</Button>
              <Button
              onClick={() => selectedCell.toner_id
                ? updatePositionMutation.mutate({
                  cabinet_id: selectedCell.cabinet_id,
                  row: selectedCell.row,
                  column: selectedCell.column,
                  toner_id: selectedCell.toner_id
                })
                : removePositionGroupMutation.mutate({
                  cabinet_id: selectedCell.cabinet_id,
                  group: selectedCell.group
                })}
                disabled={updatePositionMutation.isPending}
              >
                {updatePositionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Manufacturer Dialog */}
        <Dialog open={showManufacturerDialog} onOpenChange={setShowManufacturerDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.manufacturerNew')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('common.name')}</Label>
                <Input
                  value={newManufacturer.name}
                  onChange={(e) => setNewManufacturer({...newManufacturer, name: e.target.value})}
                  placeholder="z.B. Brother, HP, Canon"
                />
              </div>
              <div>
                <Label>{t('common.logo')}</Label>
                <ImageUpload
                  value={newManufacturer.logo_url}
                  onChange={(url) => setNewManufacturer({...newManufacturer, logo_url: url})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManufacturerDialog(false)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => createManufacturerMutation.mutate(newManufacturer)}
                disabled={!newManufacturer.name || createManufacturerMutation.isPending}
              >
                {createManufacturerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Manufacturer Dialog */}
        <Dialog open={!!editingManufacturer} onOpenChange={() => setEditingManufacturer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.edit')}</DialogTitle>
            </DialogHeader>
            {editingManufacturer && (
              <div className="space-y-4">
                <div>
                  <Label>{t('common.name')}</Label>
                  <Input
                    value={editingManufacturer.name}
                    onChange={(e) => setEditingManufacturer({...editingManufacturer, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('common.logo')}</Label>
                  <ImageUpload
                    value={editingManufacturer.logo_url}
                    onChange={(url) => setEditingManufacturer({...editingManufacturer, logo_url: url})}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingManufacturer(null)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => updateManufacturerMutation.mutate({ 
                  id: editingManufacturer.id, 
                  data: { name: editingManufacturer.name, logo_url: editingManufacturer.logo_url }
                })}
                disabled={updateManufacturerMutation.isPending}
              >
                {updateManufacturerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New PrinterModel Dialog */}
        <Dialog open={showPrinterModelDialog} onOpenChange={setShowPrinterModelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.modelsNew')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('admin.manufacturersTitle')}</Label>
                <Select
                  value={newPrinterModel.manufacturer_id || ''}
                  onValueChange={(value) => setNewPrinterModel({...newPrinterModel, manufacturer_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.selectManufacturer')} />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.model')}</Label>
                <Input
                  value={newPrinterModel.name}
                  onChange={(e) => setNewPrinterModel({...newPrinterModel, name: e.target.value})}
                  placeholder="z.B. HL-L2370DN"
                />
              </div>
              <div>
                <Label>{t('admin.requiredToners')}</Label>
                <div className="space-y-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {toners.map(t => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={newPrinterModel.toner_ids?.includes(t.id)}
                        onChange={(e) => {
                          const ids = newPrinterModel.toner_ids || [];
                          if (e.target.checked) {
                            setNewPrinterModel({...newPrinterModel, toner_ids: [...ids, t.id]});
                          } else {
                            setNewPrinterModel({...newPrinterModel, toner_ids: ids.filter(id => id !== t.id)});
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{t.model} - {t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t('common.image')}</Label>
                <ImageUpload
                  value={newPrinterModel.image_url}
                  onChange={(url) => setNewPrinterModel({...newPrinterModel, image_url: url})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPrinterModelDialog(false)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => createPrinterModelMutation.mutate(newPrinterModel)}
                disabled={!newPrinterModel.name || !newPrinterModel.manufacturer_id || createPrinterModelMutation.isPending}
              >
                {createPrinterModelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit PrinterModel Dialog */}
        <Dialog open={!!editingPrinterModel} onOpenChange={() => setEditingPrinterModel(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.edit')}</DialogTitle>
            </DialogHeader>
            {editingPrinterModel && (
              <div className="space-y-4">
                <div>
                  <Label>{t('admin.manufacturersTitle')}</Label>
                  <Select
                    value={editingPrinterModel.manufacturer_id || ''}
                    onValueChange={(value) => setEditingPrinterModel({...editingPrinterModel, manufacturer_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.selectManufacturer')} />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturers.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('common.model')}</Label>
                  <Input
                    value={editingPrinterModel.name}
                    onChange={(e) => setEditingPrinterModel({...editingPrinterModel, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('admin.requiredToners')}</Label>
                  <div className="space-y-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {toners.map(t => (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={(editingPrinterModel.toner_ids || []).includes(t.id)}
                          onChange={(e) => {
                            const ids = editingPrinterModel.toner_ids || [];
                            if (e.target.checked) {
                              setEditingPrinterModel({...editingPrinterModel, toner_ids: [...ids, t.id]});
                            } else {
                              setEditingPrinterModel({...editingPrinterModel, toner_ids: ids.filter(id => id !== t.id)});
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{t.model} - {t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>{t('common.image')}</Label>
                  <ImageUpload
                    value={editingPrinterModel.image_url}
                    onChange={(url) => setEditingPrinterModel({...editingPrinterModel, image_url: url})}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPrinterModel(null)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => updatePrinterModelMutation.mutate({ 
                  id: editingPrinterModel.id, 
                  data: { 
                    name: editingPrinterModel.name,
                    manufacturer_id: editingPrinterModel.manufacturer_id,
                    toner_ids: editingPrinterModel.toner_ids,
                    image_url: editingPrinterModel.image_url
                  }
                })}
                disabled={updatePrinterModelMutation.isPending}
              >
                {updatePrinterModelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Toner Dialog */}
        <Dialog open={showTonerDialog} onOpenChange={setShowTonerDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.tonersNew')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('admin.tonerModelLabel')}</Label>
                <Input
                  value={newToner.model}
                  onChange={(e) => setNewToner({...newToner, model: e.target.value})}
                  placeholder="z.B. TN-2420"
                />
              </div>
              <div>
                <Label>{t('admin.tonerNameLabel')}</Label>
                <Input
                  value={newToner.name}
                  onChange={(e) => setNewToner({...newToner, name: e.target.value})}
                  placeholder="z.B. Brother Toner schwarz"
                />
              </div>
              <div>
                <Label>{t('common.color')}</Label>
                <Select
                  value={newToner.color}
                  onValueChange={(value) => setNewToner({...newToner, color: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schwarz">{t('colors.schwarz')}</SelectItem>
                    <SelectItem value="cyan">{t('colors.cyan')}</SelectItem>
                    <SelectItem value="magenta">{t('colors.magenta')}</SelectItem>
                    <SelectItem value="gelb">{t('colors.gelb')}</SelectItem>
                    <SelectItem value="resttonerbehälter">{t('colors.resttonerbehälter')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.stock')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={newToner.stock}
                  onChange={(e) => setNewToner({...newToner, stock: parseInt(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>{t('common.image')}</Label>
                <ImageUpload
                  value={newToner.image_url}
                  onChange={(url) => setNewToner({...newToner, image_url: url})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTonerDialog(false)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => createTonerMutation.mutate(newToner)}
                disabled={!newToner.model || createTonerMutation.isPending}
              >
                {createTonerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Toner Dialog */}
        <Dialog open={!!editingToner} onOpenChange={() => setEditingToner(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.edit')}</DialogTitle>
            </DialogHeader>
            {editingToner && (
              <div className="space-y-4">
                <div>
                  <Label>{t('admin.tonerModelLabel')}</Label>
                  <Input
                    value={editingToner.model}
                    onChange={(e) => setEditingToner({...editingToner, model: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('admin.tonerNameLabel')}</Label>
                  <Input
                    value={editingToner.name}
                    onChange={(e) => setEditingToner({...editingToner, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('common.color')}</Label>
                  <Select
                    value={editingToner.color}
                    onValueChange={(value) => setEditingToner({...editingToner, color: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="schwarz">{t('colors.schwarz')}</SelectItem>
                      <SelectItem value="cyan">{t('colors.cyan')}</SelectItem>
                      <SelectItem value="magenta">{t('colors.magenta')}</SelectItem>
                      <SelectItem value="gelb">{t('colors.gelb')}</SelectItem>
                      <SelectItem value="resttonerbehälter">{t('colors.resttonerbehälter')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('common.stock')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editingToner.stock || 0}
                    onChange={(e) => setEditingToner({...editingToner, stock: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>{t('common.image')}</Label>
                  <ImageUpload
                    value={editingToner.image_url}
                    onChange={(url) => setEditingToner({...editingToner, image_url: url})}
                  />
                </div>
                {locations.length > 0 && (
                  <div className="pt-4 border-t border-slate-200">
                    <div className="font-medium text-slate-800 mb-2">{t('common.location')}</div>
                    <div className="space-y-2">
                      {locations.map((location) => {
                        const values = editingLocationSettings[location.id] || { min_stock: 0 };
                        return (
                          <div key={location.id} className="grid grid-cols-2 gap-3 items-center">
                            <div className="text-sm text-slate-700">{location.name}</div>
                            <Input
                              type="number"
                              min={0}
                              value={values.min_stock}
                              onChange={(e) => setEditingLocationSettings((prev) => ({
                                ...prev,
                                [location.id]: {
                                  ...values,
                                  min_stock: parseInt(e.target.value, 10) || 0
                                }
                              }))}
                              placeholder={t('common.minStock')}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {t('common.minStock')}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingToner(null)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => updateTonerMutation.mutate({ 
                  id: editingToner.id, 
                  data: { 
                    model: editingToner.model,
                    name: editingToner.name,
                    color: editingToner.color,
                    stock: editingToner.stock,
                    image_url: editingToner.image_url
                  }
                })}
                disabled={updateTonerMutation.isPending}
              >
                {updateTonerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Printer Dialog */}
        <Dialog open={showPrinterDialog} onOpenChange={setShowPrinterDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.printersNew')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('admin.printerName')}</Label>
                <Input
                  value={newPrinter.name}
                  onChange={(e) => setNewPrinter({...newPrinter, name: e.target.value})}
                  placeholder="z.B. Büro 1. OG"
                />
              </div>
              <div>
                <Label>{t('admin.printerModel')}</Label>
                <Select
                  value={newPrinter.printer_model_id || ''}
                  onValueChange={(value) => setNewPrinter({...newPrinter, printer_model_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.selectModel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturers.map(m => {
                      const models = printerModels.filter(pm => pm.manufacturer_id === m.id);
                      if (models.length === 0) return null;
                      return (
                        <React.Fragment key={m.id}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">{m.name}</div>
                          {models.map(model => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('admin.printerLocation')}</Label>
                <Select
                  value={newPrinter.location_id || ''}
                  onValueChange={(value) => setNewPrinter({...newPrinter, location_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.selectLocation')} />
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPrinterDialog(false)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => createPrinterMutation.mutate(newPrinter)}
                disabled={!newPrinter.name || !newPrinter.printer_model_id || !newPrinter.location_id || createPrinterMutation.isPending}
              >
                {createPrinterMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Location Dialog */}
        <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.locationCreate')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('admin.locationName')}</Label>
                <Input
                  value={newLocation.name}
                  onChange={(e) => setNewLocation({ name: e.target.value })}
                  placeholder="z.B. CH Markt / 3. OG"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLocationDialog(false)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => createLocationMutation.mutate(newLocation)}
                disabled={!newLocation.name || createLocationMutation.isPending}
              >
                {createLocationMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Location Dialog */}
        <Dialog open={!!editingLocation} onOpenChange={() => setEditingLocation(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.locationEdit')}</DialogTitle>
            </DialogHeader>
            {editingLocation && (
              <div className="space-y-4">
                <div>
                  <Label>{t('admin.locationName')}</Label>
                  <Input
                    value={editingLocation.name}
                    onChange={(e) => setEditingLocation({ ...editingLocation, name: e.target.value })}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLocation(null)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => updateLocationMutation.mutate({ id: editingLocation.id, data: { name: editingLocation.name } })}
                disabled={updateLocationMutation.isPending}
              >
                {updateLocationMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Printer Dialog */}
        <Dialog open={!!editingPrinter} onOpenChange={() => setEditingPrinter(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.edit')}</DialogTitle>
            </DialogHeader>
            {editingPrinter && (
              <div className="space-y-4">
                <div>
                  <Label>{t('admin.printerName')}</Label>
                  <Input
                    value={editingPrinter.name}
                    onChange={(e) => setEditingPrinter({...editingPrinter, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('admin.printerModel')}</Label>
                  <Select
                    value={editingPrinter.printer_model_id || ''}
                    onValueChange={(value) => setEditingPrinter({...editingPrinter, printer_model_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.selectModel')} />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturers.map(m => {
                        const models = printerModels.filter(pm => pm.manufacturer_id === m.id);
                        if (models.length === 0) return null;
                        return (
                          <React.Fragment key={m.id}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">{m.name}</div>
                            {models.map(model => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('admin.printerLocation')}</Label>
                  <Select
                    value={editingPrinter.location_id || ''}
                    onValueChange={(value) => setEditingPrinter({...editingPrinter, location_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.selectLocation')} />
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
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPrinter(null)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => updatePrinterMutation.mutate({ 
                  id: editingPrinter.id, 
                  data: { 
                    name: editingPrinter.name,
                    printer_model_id: editingPrinter.printer_model_id,
                    location_id: editingPrinter.location_id
                  }
                })}
                disabled={updatePrinterMutation.isPending}
              >
                {updatePrinterMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.userReset')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                {t('admin.userReset')}: <span className="font-medium">{resetUser?.email}</span>
              </div>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder={t('admin.userPassword')}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetUser(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => updateUserMutation.mutate({
                  id: resetUser.id,
                  data: { password: resetPassword }
                })}
                disabled={!resetPassword}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
