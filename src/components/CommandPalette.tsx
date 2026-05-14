import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { Separator } from '@/components/ui/separator';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // keyboard shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search... (⌘K)" />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => { navigate('/'); setOpen(false); }}>Dashboard</CommandItem>
            <CommandItem onSelect={() => { navigate('/submit'); setOpen(false); }}>Submit Claim</CommandItem>
            <CommandItem onSelect={() => { navigate('/history'); setOpen(false); }}>Claim History</CommandItem>
            <CommandItem onSelect={() => { navigate('/settings'); setOpen(false); }}>Settings</CommandItem>
          </CommandGroup>
          <Separator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setOpen(false); }}>
              Toggle Theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
