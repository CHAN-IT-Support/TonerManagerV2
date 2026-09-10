import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from "@/lib/utils";
import { ArrowRight, ArrowUp, Package, Trash2 } from 'lucide-react';

export default function ShelfGrid({ 
  rows, 
  columns, 
  positions, 
  toners, 
  highlightTonerId,
  highlightTonerIds = [], 
  highlightCell,
  onCellClick,
  onExpand,
  editable = false,
  cabinetName
}) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const getPositionData = (row, col) => {
    return positions.find(p => p.row === row && p.column === col);
  };

  const getTonerForPosition = (position) => {
    if (!position?.toner_id) return null;
    return toners.find(t => t.id === position.toner_id);
  };

  const positionByCell = new Map(
    positions.map((position) => [`${position.row}:${position.column}`, position])
  );

  const getCellKey = (row, column) => `${row}:${column}`;

  const getTonerAt = (row, column) => {
    return getTonerForPosition(positionByCell.get(getCellKey(row, column)));
  };

  const getTonerGroup = (row, column, toner) => {
    const cells = [];
    const queue = [[row, column]];
    const visited = new Set();

    while (queue.length > 0) {
      const [currentRow, currentColumn] = queue.shift();
      const key = getCellKey(currentRow, currentColumn);
      if (visited.has(key) || currentRow < 0 || currentRow >= rows || currentColumn < 0 || currentColumn >= columns) {
        continue;
      }
      visited.add(key);
      if (getTonerAt(currentRow, currentColumn)?.id !== toner.id) continue;

      cells.push({ row: currentRow, column: currentColumn });
      queue.push(
        [currentRow - 1, currentColumn],
        [currentRow + 1, currentColumn],
        [currentRow, currentColumn - 1],
        [currentRow, currentColumn + 1]
      );
    }

    const minRow = Math.min(...cells.map((cell) => cell.row));
    const maxRow = Math.max(...cells.map((cell) => cell.row));
    const minColumn = Math.min(...cells.map((cell) => cell.column));
    const maxColumn = Math.max(...cells.map((cell) => cell.column));
    const cellKeys = new Set(cells.map((cell) => getCellKey(cell.row, cell.column)));
    const isRectangle = cells.length === (maxRow - minRow + 1) * (maxColumn - minColumn + 1)
      && Array.from({ length: maxRow - minRow + 1 }).every((_, rowOffset) =>
        Array.from({ length: maxColumn - minColumn + 1 }).every((__, columnOffset) =>
          cellKeys.has(getCellKey(minRow + rowOffset, minColumn + columnOffset))
        )
      );

    return isRectangle
      ? { row: minRow, column: minColumn, rowSpan: maxRow - minRow + 1, columnSpan: maxColumn - minColumn + 1 }
      : { row, column, rowSpan: 1, columnSpan: 1 };
  };

  const getExpansionAvailability = (group) => {
    const rightColumn = group.column + group.columnSpan;
    const upRow = group.row - 1;
    const canExpandRight = rightColumn < columns && Array.from({ length: group.rowSpan }).every((_, offset) =>
      !getTonerAt(group.row + offset, rightColumn)
    );
    const canExpandUp = upRow >= 0 && Array.from({ length: group.columnSpan }).every((_, offset) =>
      !getTonerAt(upRow, group.column + offset)
    );
    return { canExpandRight, canExpandUp };
  };

  const getTonerColor = (toner) => {
    if (!toner) return 'bg-slate-600';
    const colors = {
      schwarz: 'bg-slate-800',
      cyan: 'bg-cyan-500',
      magenta: 'bg-pink-500',
      gelb: 'bg-yellow-400',
      resttonerbehälter: 'bg-emerald-600'
    };
    return colors[toner.color] || 'bg-slate-400';
  };

  return (
    <div className="relative">
      {/* Schrank-Rahmen */}
      <div className="bg-gradient-to-b from-slate-600 to-slate-700 p-2 rounded-lg shadow-xl">
        {cabinetName && (
          <div className="text-center text-white text-xs font-medium mb-1 opacity-80">
            {cabinetName}
          </div>
        )}
        <div className="bg-slate-800/50 rounded-md p-1.5 overflow-hidden">
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
            }}
          >
            {Array.from({ length: rows * columns }).map((_, index) => {
                  const rowIndex = Math.floor(index / columns);
                  const colIndex = index % columns;
                  const position = getPositionData(rowIndex, colIndex);
                  const toner = getTonerForPosition(position);
                  const group = toner ? getTonerGroup(rowIndex, colIndex, toner) : null;
                  const isGroupStart = !group || (group.row === rowIndex && group.column === colIndex);
                  if (!isGroupStart) return null;
                  const { canExpandRight, canExpandUp } = group ? getExpansionAvailability(group) : {};
                  const isHighlighted = highlightCell
                    ? highlightCell.row === rowIndex && highlightCell.column === colIndex
                    : (highlightTonerId && toner?.id === highlightTonerId) || 
                      (highlightTonerIds.length > 0 && highlightTonerIds.includes(toner?.id));

                  return (
                    <motion.div
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => onCellClick?.(rowIndex, colIndex, position, group)}
                      onMouseEnter={() => setHoveredCell(`${rowIndex}:${colIndex}`)}
                      onMouseLeave={() => setHoveredCell(null)}
                      initial={{ scale: 1 }}
                      animate={{ 
                        scale: isHighlighted ? [1, 1.12, 1] : 1,
                        boxShadow: isHighlighted
                          ? ['0 0 0 rgba(16, 185, 129, 0)', '0 0 36px rgba(16, 185, 129, 1)', '0 0 0 rgba(16, 185, 129, 0)']
                          : 'none'
                      }}
                      transition={{ 
                        repeat: isHighlighted ? Infinity : 0, 
                        duration: 1.2 
                      }}
                      style={{
                        gridRow: `${rowIndex + 1} / span ${group?.rowSpan || 1}`,
                        gridColumn: `${colIndex + 1} / span ${group?.columnSpan || 1}`
                      }}
                      className={cn(
                          "group relative min-h-[36px] sm:min-h-[40px] rounded-md border transition-all duration-200",
                          group && (group.rowSpan > 1 || group.columnSpan > 1) ? "h-full" : "aspect-square",
                        "flex flex-col items-center justify-center p-0.5",
                        editable && "cursor-pointer hover:border-slate-400",
                        !editable && !toner && "cursor-default",
                        toner ? "border-slate-500/50 bg-slate-200" : "border-slate-600/50 bg-slate-700/50",
                        isHighlighted && "ring-4 ring-emerald-500 border-emerald-600 bg-emerald-200 shadow-[0_0_0_5px_rgba(16,185,129,0.85)]",
                        (editable || onCellClick) && "cursor-pointer"
                      )}
                    >
                      {toner ? (
                      <>
                      {toner.image_url ? (
                      <img 
                        src={toner.image_url} 
                        alt={toner.model} 
                        className="w-7 h-7 rounded object-cover mb-0.5"
                      />
                      ) : (
                      <div className={cn(
                        "w-6 h-6 rounded flex items-center justify-center mb-0.5",
                        getTonerColor(toner)
                      )}>
                        {toner.color === 'resttonerbehälter' ? (
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Package className={cn(
                            "w-3.5 h-3.5",
                            toner.color === 'gelb' ? 'text-amber-900' : 'text-white'
                          )} />
                        )}
                      </div>
                      )}
                      <span className="text-[9px] font-medium text-slate-700 truncate w-full text-center px-0.5">
                      {toner.model}
                      </span>
                      </>
                      ) : (
                      <span className="text-xs text-slate-400">
                      {editable ? '+' : ''}
                      </span>
                      )}
                      {editable && toner && onExpand && (canExpandRight || canExpandUp) && (
                        <div className={cn(
                          "absolute right-1 top-1 z-20 flex gap-1 transition-opacity",
                          hoveredCell === `${rowIndex}:${colIndex}` ? "opacity-100" : "pointer-events-none opacity-0"
                        )}>
                          {canExpandRight && (
                            <button
                              type="button"
                              title="Nach rechts erweitern"
                              aria-label="Nach rechts erweitern"
                              onClick={(event) => {
                                event.stopPropagation();
                                onExpand({ row: group.row, column: group.column, rowSpan: group.rowSpan, columnSpan: group.columnSpan }, 'right', toner);
                              }}
                              className="rounded bg-slate-900/75 p-1 text-white hover:bg-slate-900"
                            >
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                          {canExpandUp && (
                            <button
                              type="button"
                              title="Nach oben erweitern"
                              aria-label="Nach oben erweitern"
                              onClick={(event) => {
                                event.stopPropagation();
                                onExpand({ row: group.row, column: group.column, rowSpan: group.rowSpan, columnSpan: group.columnSpan }, 'up', toner);
                              }}
                              className="rounded bg-slate-900/75 p-1 text-white hover:bg-slate-900"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
            })}
          </div>
        </div>
      </div>
      
      {/* Schrank-Füße */}
      <div className="flex justify-between px-3 -mt-0.5">
        <div className="w-6 h-3 bg-gradient-to-b from-slate-700 to-slate-900 rounded-b-md" />
        <div className="w-6 h-3 bg-gradient-to-b from-slate-700 to-slate-900 rounded-b-md" />
      </div>
    </div>
  );
}
