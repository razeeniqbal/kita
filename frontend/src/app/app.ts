import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService, Toast } from './core/ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <div class="toast" [class.show]="toast.visible()" role="status" aria-live="polite">{{ toast.message() }}</div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly toast = inject(Toast);
  // Applies the saved appearance before anything renders.
  private readonly theme = inject(ThemeService);
}
