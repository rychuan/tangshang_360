import React from 'react';
import { Icon, type IconProps } from '@iconify/react';

export type HugeIconProps = Omit<
  React.SVGProps<SVGSVGElement>,
  'height' | 'width'
> & {
  absoluteStrokeWidth?: boolean;
  height?: IconProps['height'];
  size?: IconProps['height'];
  strokeWidth?: number | string;
  width?: IconProps['width'];
};

export type LucideIcon = React.ComponentType<HugeIconProps>;

const createHugeIcon = (name: string): LucideIcon => {
  const HugeIcon: React.FC<HugeIconProps> = ({
    absoluteStrokeWidth: _absoluteStrokeWidth,
    height,
    size,
    strokeWidth: _strokeWidth,
    width,
    ...props
  }) => {
    const iconProps = props as Omit<IconProps, 'icon'>;

    return (
      <Icon
        {...iconProps}
        icon={`hugeicons:${name}`}
        width={width ?? size}
        height={height ?? size}
      />
    );
  };

  HugeIcon.displayName = `HugeIcon(${name})`;
  return HugeIcon;
};

export const AlertCircle = createHugeIcon('alert-circle');
export const AlertTriangle = createHugeIcon('alert-02');
export const AlignCenter = createHugeIcon('text-align-center');
export const AlignLeft = createHugeIcon('text-align-left');
export const AlignRight = createHugeIcon('text-align-right');
export const AreaChart = createHugeIcon('chart-area');
export const AreaChartIcon = AreaChart;
export const ArrowDownToLine = createHugeIcon('arrow-down-from-line');
export const ArrowLeft = createHugeIcon('arrow-left-01');
export const ArrowRight = createHugeIcon('arrow-right-01');
export const ArrowUp = createHugeIcon('arrow-up-01');
export const ArrowUpFromLine = createHugeIcon('arrow-up-from-line');
export const ArrowUpRight = createHugeIcon('arrow-up-right-01');
export const Asterisk = createHugeIcon('asterisk');
export const Award = createHugeIcon('award-01');
export const Ban = createHugeIcon('blocked');
export const BarChart3 = createHugeIcon('chart-bar-line');
export const BarChart3Icon = BarChart3;
export const Baseline = createHugeIcon('text-font');
export const Bell = createHugeIcon('notification-02');
export const BellRing = createHugeIcon('notification-03');
export const Bold = createHugeIcon('text-bold');
export const BookOpen = createHugeIcon('book-open-01');
export const Building2 = createHugeIcon('building-02');
export const CalendarIcon = createHugeIcon('calendar-03');
export const Check = createHugeIcon('tick-02');
export const CheckCircle = createHugeIcon('checkmark-circle-02');
export const CheckCircle2 = CheckCircle;
export const CheckIcon = Check;
export const ChevronDown = createHugeIcon('arrow-down-01');
export const ChevronDownIcon = ChevronDown;
export const ChevronLeft = createHugeIcon('arrow-left-01');
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRight = createHugeIcon('arrow-right-01');
export const ChevronRightIcon = ChevronRight;
export const ChevronUp = createHugeIcon('arrow-up-01');
export const ChevronUpIcon = ChevronUp;
export const CircleAlert = createHugeIcon('alert-circle');
export const CircleAlertIcon = CircleAlert;
export const CircleCheckIcon = CheckCircle;
export const CircleIcon = createHugeIcon('circle');
export const CircleX = createHugeIcon('cancel-circle');
export const CircleXIcon = CircleX;
export const ClipboardCheck = createHugeIcon('clipboard');
export const ClipboardList = createHugeIcon('clipboard');
export const Clock = createHugeIcon('clock-01');
export const Clock3 = createHugeIcon('clock-03');
export const Code = createHugeIcon('source-code');
export const CodeXml = Code;
export const Copy = createHugeIcon('copy-01');
export const Database = createHugeIcon('database-02');
export const Download = createHugeIcon('download-04');
export const DownloadIcon = Download;
export const Eraser = createHugeIcon('eraser');
export const Eye = createHugeIcon('view');
export const EyeIcon = Eye;
export const FileDown = createHugeIcon('file-download');
export const FileText = createHugeIcon('file-02');
export const FolderPlus = createHugeIcon('folder-add');
export const Gauge = createHugeIcon('dashboard-speed-01');
export const Grid2X2 = createHugeIcon('grid');
export const GripVerticalIcon = createHugeIcon('drag-drop-vertical');
export const Heading1 = createHugeIcon('heading-01');
export const Heading2 = createHugeIcon('heading-02');
export const Heading3 = createHugeIcon('heading-03');
export const Heading4 = createHugeIcon('heading-04');
export const Heading5 = createHugeIcon('heading-05');
export const Heading6 = createHugeIcon('heading-06');
export const HelpCircle = createHugeIcon('help-circle');
export const History = createHugeIcon('time-schedule');
export const Image = createHugeIcon('image-01');
export const Inbox = createHugeIcon('inbox');
export const Info = createHugeIcon('information-circle');
export const InfoIcon = Info;
export const Italic = createHugeIcon('text-italic');
export const Link = createHugeIcon('link-01');
export const Link2 = createHugeIcon('link-02');
export const Link2Off = createHugeIcon('unlink-01');
export const List = createHugeIcon('left-to-right-list-bullet');
export const ListOrdered = createHugeIcon('left-to-right-list-number');
export const ListTodo = createHugeIcon('task-01');
export const Loader2 = createHugeIcon('loading-03');
export const Loader2Icon = Loader2;
export const Lock = createHugeIcon('square-lock-02');
export const Minus = createHugeIcon('minus-sign');
export const MinusIcon = Minus;
export const Moon = createHugeIcon('moon-02');
export const MoreHorizontal = createHugeIcon('more-horizontal');
export const MoreHorizontalIcon = MoreHorizontal;
export const PanelLeftIcon = createHugeIcon('panel-left');
export const Paperclip = createHugeIcon('attachment-01');
export const Pencil = createHugeIcon('pencil-edit-01');
export const PieChartIcon = createHugeIcon('pie-chart');
export const Plus = createHugeIcon('add-01');
export const Quote = createHugeIcon('quote-down');
export const Redo = createHugeIcon('redo');
export const RefreshCw = createHugeIcon('refresh');
export const RotateCcw = createHugeIcon('rotate-left-01');
export const Save = createHugeIcon('floppy-disk');
export const Search = createHugeIcon('search-01');
export const SearchIcon = Search;
export const Send = createHugeIcon('sent');
export const Settings2 = createHugeIcon('settings-02');
export const Shield = createHugeIcon('shield-01');
export const ShieldCheck = createHugeIcon('shield-02');
export const Smartphone = createHugeIcon('smart-phone-01');
export const Star = createHugeIcon('star');
export const Strikethrough = createHugeIcon('text-strikethrough');
export const Sun = createHugeIcon('sun-03');
export const Trash2 = createHugeIcon('delete-02');
export const Trash2Icon = Trash2;
export const TrendingUp = createHugeIcon('chart-increase');
export const TrendingUpIcon = TrendingUp;
export const Type = createHugeIcon('text-font');
export const Underline = createHugeIcon('text-underline');
export const Undo = createHugeIcon('undo');
export const Undo2 = createHugeIcon('undo-02');
export const Unlink = createHugeIcon('unlink-01');
export const Unlock = createHugeIcon('square-unlock-02');
export const Upload = createHugeIcon('upload-04');
export const User = createHugeIcon('user');
export const UserCog = createHugeIcon('user-settings-01');
export const UserPlus = createHugeIcon('user-add-01');
export const Users = createHugeIcon('user-group');
export const UserX = createHugeIcon('user-remove-01');
export const X = createHugeIcon('cancel-01');
export const XCircle = createHugeIcon('cancel-circle');
export const XIcon = X;
