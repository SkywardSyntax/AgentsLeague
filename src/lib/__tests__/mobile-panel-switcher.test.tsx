import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MobilePanelSwitcher } from '@/components/app/MobilePanelSwitcher';

afterEach(cleanup);

describe('MobilePanelSwitcher', () => {
  it('Canvas tab has aria-selected=true and tabIndex=0 when activePanel is whiteboard', () => {
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={() => {}} />);

    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });

    expect(canvasTab.getAttribute('aria-selected')).toBe('true');
    expect(canvasTab.tabIndex).toBe(0);
    expect(chatTab.getAttribute('aria-selected')).toBe('false');
    expect(chatTab.tabIndex).toBe(-1);
  });

  it('Chat tab has aria-selected=true and tabIndex=0 when activePanel is chat', () => {
    render(<MobilePanelSwitcher activePanel="chat" onSwitch={() => {}} />);

    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });

    expect(chatTab.getAttribute('aria-selected')).toBe('true');
    expect(chatTab.tabIndex).toBe(0);
    expect(canvasTab.getAttribute('aria-selected')).toBe('false');
    expect(canvasTab.tabIndex).toBe(-1);
  });

  it('ArrowRight on Canvas tab calls onSwitch with chat', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={onSwitch} />);

    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    fireEvent.keyDown(canvasTab, { key: 'ArrowRight' });

    expect(onSwitch).toHaveBeenCalledWith('chat');
  });

  it('ArrowLeft on Chat tab wraps to whiteboard', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="chat" onSwitch={onSwitch} />);

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    fireEvent.keyDown(chatTab, { key: 'ArrowLeft' });

    expect(onSwitch).toHaveBeenCalledWith('whiteboard');
  });

  it('ArrowLeft on Canvas tab wraps to chat', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={onSwitch} />);

    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    fireEvent.keyDown(canvasTab, { key: 'ArrowLeft' });

    expect(onSwitch).toHaveBeenCalledWith('chat');
  });

  it('Home key selects first tab (whiteboard)', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="chat" onSwitch={onSwitch} />);

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    fireEvent.keyDown(chatTab, { key: 'Home' });

    expect(onSwitch).toHaveBeenCalledWith('whiteboard');
  });

  it('End key selects last tab (chat)', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={onSwitch} />);

    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    fireEvent.keyDown(canvasTab, { key: 'End' });

    expect(onSwitch).toHaveBeenCalledWith('chat');
  });

  it('both tabs have aria-controls attributes', () => {
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={() => {}} />);

    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });

    expect(canvasTab.getAttribute('aria-controls')).toBe('panel-whiteboard');
    expect(chatTab.getAttribute('aria-controls')).toBe('panel-chat');
  });
});
