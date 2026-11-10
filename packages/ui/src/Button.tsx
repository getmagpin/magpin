import type { ComponentChildren, JSX } from 'preact';

export interface ButtonProps extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'class'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  block?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  class?: string;
  children?: ComponentChildren;
}

export function Button({ variant = 'primary', block = false, type = 'button', class: extra, children, ...rest }: ButtonProps) {
  const classes = ['mp-btn', `mp-btn--${variant}`, block ? 'mp-btn--block' : '', extra ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} class={classes} {...rest}>
      {children}
    </button>
  );
}
