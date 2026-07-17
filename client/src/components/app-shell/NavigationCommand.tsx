import { useNavigate } from 'react-router-dom';
import type { NavItem } from '@/components/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface NavigationCommandProps {
  items: NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NavigationCommand({
  items,
  open,
  onOpenChange,
}: NavigationCommandProps) {
  const navigate = useNavigate();

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="搜索功能或页面"
      description="仅搜索当前有权访问的系统功能"
      className="max-w-xl rounded-lg"
    >
      <CommandInput placeholder="搜索功能或页面" />
      <CommandList>
        <CommandEmpty>没有匹配的功能</CommandEmpty>
        <CommandGroup heading="可访问页面">
          {items.map((item) => (
            <CommandItem
              key={item.path}
              value={`${item.label} ${item.path}`}
              onSelect={() => {
                navigate(item.path);
                onOpenChange(false);
              }}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
