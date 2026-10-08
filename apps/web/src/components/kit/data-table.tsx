import { cn } from "cn";
import type { ReactNode } from "react";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Right-align (amounts). */
  numeric?: boolean;
};

/**
 * Mockup `tbl()`. From 600px up it is the bordered table; on phones each row
 * becomes a card: the first column as its title, the rest as label/value pairs.
 * Both are server-rendered; CSS picks one, so it needs no client JavaScript.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Accessible name for the table (visually hidden). */
  caption: string;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) {
    return <div className="rounded-[12px] border border-line bg-surface p-4 text-muted-foreground">{empty}</div>;
  }
  const [first, ...rest] = columns;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[12px] border border-line bg-surface min-[600px]:block">
        <table className="w-full border-collapse text-[13.5px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground",
                    column.numeric && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="[&:last-child>td]:border-b-0">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "border-b border-line px-3 py-2.5 whitespace-nowrap",
                      column.numeric && "num text-right",
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2.5 min-[600px]:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="grid gap-2 rounded-[12px] border border-line bg-surface p-3.5">
            {first ? <div className="font-semibold">{first.cell(row)}</div> : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
              {rest.map((column) => (
                <div key={column.key} className="contents">
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd className={cn("m-0 min-w-0 font-medium", column.numeric && "num")}>{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
