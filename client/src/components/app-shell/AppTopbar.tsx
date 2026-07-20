import React from 'react';
import { useScrollStuck } from '@/hooks/useScrollStuck';
import { Moon, Search, Sun } from '@/components/ui/hugeicons';
import type { NavItem } from '@/components/navigation';
import type { UserInput } from '@/components/business-ui/types/user';
import { NavigationCommand } from '@/components/app-shell/NavigationCommand';
import { UserDisplay } from '@/components/business-ui/user-display';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { SidebarTrigger } from '@/components/ui/sidebar';

export interface AppTopbarProps {
  currentLabel: string;
  items: NavItem[];
  userInfo?: Pick<UserInput, 'user_id' | 'name'> | null;
}

export function AppTopbar({
  currentLabel,
  items,
  userInfo,
}: AppTopbarProps) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const stuck = useScrollStuck();
  const [isDark, setIsDark] = React.useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      return true;
    }
    if (saved === 'light') {
      document.documentElement.classList.remove('dark');
      return false;
    }
    return document.documentElement.classList.contains('dark');
  });

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle('dark', nextIsDark);
    localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
    setIsDark(nextIsDark);
  };

  return (
    <>
      <header
        className={
          `sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-6 transition-shadow duration-300 ${
            stuck ? 'shadow-sm' : ''
          }`
        }
      >
        <SidebarTrigger />
        <p className="min-w-0 truncate text-[14px] font-semibold">
          {currentLabel}
        </p>
        <Button
          variant="ghost"
          onClick={() => setCommandOpen(true)}
          className="ml-auto h-9 w-full max-w-[420px] justify-start bg-muted px-3 text-[12px] text-muted-foreground"
        >
          <Search className="size-4" />
          <span>搜索功能或页面</span>
          <Kbd className="ml-auto hidden sm:inline-flex">⌘ K</Kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={isDark ? '切换到明亮主题' : '切换到暗色主题'}
          className="size-9"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <UserDisplay
          value={{ user_id: userInfo?.user_id, name: userInfo?.name }}
          size="medium"
          showLabel={false}
        />
      </header>
      <NavigationCommand
        items={items}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
    </>
  );
}
