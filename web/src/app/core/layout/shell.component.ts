import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { Subscription, filter } from "rxjs";
import { AuthService } from "../auth/auth.service";
import { MenuItem, actorRoleLabel, menuTrail } from "../auth/access-control.model";
import { I18nService } from "../i18n/i18n.service";
import { MessageKey } from "../i18n/message-catalog";
import {
  formatNotificationContent,
  groupByTime,
  notifIcon,
  notifRelativeTime,
  notifRoute,
  notifTone,
} from "../models/notification.model";
import { NotificationStore } from "../services/notification.store";
import { NotificationItem } from "../services/api.service";
import { SgSearchInputComponent } from "../../shared/ui/sg-search-input.component";
import { SgModalComponent } from "src/app/shared/ui/sg-modal.component";
import { SgButtonDirective } from "src/app/shared/ui/sg-button.directive";

/**
 * Khung ứng dụng theo mockup MH02/MH13:
 * sidebar navy gradient render từ `menu[]` của API · topbar tìm kiếm nhanh Ctrl+K,
 * chuông thông báo có badge, avatar kèm tên vai trò · breadcrumb ngay dưới topbar.
 */
@Component({
  selector: "app-shell",
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule,
    FormsModule,
    DatePipe,
    SgSearchInputComponent,
    SgModalComponent,
    SgButtonDirective,
  ],
  template: `
    <div class="shell" [class.shell--collapsed]="collapsed()">
      <aside class="sidebar">
        <a
          class="brand"
          [routerLink]="homeRoute()"
          [attr.title]="t('ui.shell.brandFull')"
        >
          <img
            class="brand__emblem"
            src="assets/quoc-huy.svg"
            [alt]="t('ui.shell.emblemAlt')"
            width="36"
            height="36"
          />
          <span class="brand__copy">
            <strong>{{ t("ui.shell.brandName") }}</strong>
            <em>{{ t("ui.shell.brandPlace") }}</em>
          </span>
        </a>

        <nav class="nav" [attr.aria-label]="t('ui.shell.mainMenu')">
          @for (item of menu(); track item.key) {
            @if (item.children?.length) {
              <div class="nav-group" [class.nav-group--open]="isOpen(item)">
                <button
                  type="button"
                  class="nav-link nav-link--parent"
                  [class.nav-link--active]="isTrail(item)"
                  [attr.aria-expanded]="isOpen(item)"
                  [attr.title]="menuLabel(item)"
                  (click)="toggle(item)"
                >
                  <mat-icon fontSet="material-icons-round">{{
                    item.icon || "chevron_right"
                  }}</mat-icon>
                  <span class="nav-link__label">{{ menuLabel(item) }}</span>
                  <mat-icon
                    class="nav-link__caret"
                    fontSet="material-icons-round"
                    >expand_more</mat-icon
                  >
                </button>
                @if (isOpen(item)) {
                  <div class="nav-children">
                    @for (child of item.children; track child.key) {
                      <a
                        class="nav-child"
                        [class.nav-child--active]="isActive(child)"
                        [routerLink]="child.route"
                      >
                        <span class="nav-child__dot"></span>{{ menuLabel(child) }}
                      </a>
                    }
                  </div>
                }
              </div>
            } @else {
              <a
                class="nav-link"
                [class.nav-link--active]="isActive(item)"
                [routerLink]="item.route"
                [attr.title]="menuLabel(item)"
              >
                <mat-icon fontSet="material-icons-round">{{
                  item.icon || "chevron_right"
                }}</mat-icon>
                <span class="nav-link__label">{{ menuLabel(item) }}</span>
              </a>
            }
          } @empty {
            <p class="nav-empty">{{ t("ui.shell.menuEmpty") }}</p>
          }
        </nav>

        <button type="button" class="collapse-btn" (click)="toggleCollapse()">
          <mat-icon fontSet="material-icons-round">{{
            collapsed() ? "chevron_right" : "chevron_left"
          }}</mat-icon>
          <span class="nav-link__label">{{ t("ui.shell.collapse") }}</span>
        </button>
      </aside>

      <header class="topbar">
        <button
          type="button"
          class="icon-action"
          [attr.aria-label]="t('ui.shell.toggleMenu')"
          (click)="toggleCollapse()"
        >
          <mat-icon fontSet="material-icons-round">menu</mat-icon>
        </button>

        <div class="topbar__search">
          <sg-search-input
            [placeholder]="t('ui.shell.searchPlaceholder')"
            shortcut="Ctrl + K"
            [ariaLabel]="t('ui.shell.searchAria')"
            [(ngModel)]="keyword"
            (search)="quickSearch()"
          />
        </div>

        <div class="topbar__actions">
          <div class="dropdown">
            <button
              type="button"
              class="locale-btn"
              [attr.aria-expanded]="localeOpen()"
              [attr.title]="t('ui.locale.switch')"
              [attr.aria-label]="t('ui.locale.switch')"
              (click)="toggleLocale()"
            >
              <mat-icon fontSet="material-icons-round">language</mat-icon>
              <span>{{ i18n.shortName() }}</span>
            </button>
            @if (localeOpen()) {
              <div class="panel panel--locale">
                @for (option of i18n.options(); track option.code) {
                  <button
                    type="button"
                    [class.panel--locale__active]="
                      option.code === i18n.locale()
                    "
                    (click)="chooseLocale(option.code)"
                  >
                    <span class="locale-code">{{ option.shortName }}</span
                    >{{ option.name }}
                  </button>
                }
              </div>
            }
          </div>

          <div class="dropdown">
            <button
              type="button"
              class="icon-action"
              [attr.aria-expanded]="helpOpen()"
              [attr.title]="t('ui.shell.help')"
              [attr.aria-label]="t('ui.shell.help')"
              (click)="toggleHelp()"
            >
              <mat-icon fontSet="material-icons-round">help_outline</mat-icon>
            </button>
            @if (helpOpen()) {
              <div class="panel panel--help">
                <strong>{{ t("ui.shell.helpTitle") }}</strong>
                <span
                  ><mat-icon fontSet="material-icons-round">call</mat-icon>0212
                  3 888 999</span
                >
                <span
                  ><mat-icon fontSet="material-icons-round">mail</mat-icon
                  >hotro&#64;chc.gov.vn</span
                >
                <span
                  ><mat-icon fontSet="material-icons-round">place</mat-icon
                  >{{ t("ui.shell.helpAddress") }}</span
                >
              </div>
            }
          </div>

          <div class="dropdown">
            <button
              type="button"
              class="icon-action"
              [attr.aria-expanded]="bellOpen()"
              [attr.aria-label]="
                t('ui.shell.notificationsAria', { count: unreadCount() })
              "
              [attr.title]="t('ui.shell.notifications')"
              (click)="toggleBell()"
            >
              <mat-icon fontSet="material-icons-round">notifications</mat-icon>
              @if (unreadCount() > 0) {
                <span class="badge">{{ badge() }}</span>
              }
            </button>
            @if (bellOpen()) {
              <div class="panel panel--notifications">
                <header class="panel__head">
                  <strong>{{ t("ui.shell.notifications") }}</strong>
                  <button
                    type="button"
                    class="link-btn"
                    [disabled]="unreadCount() === 0"
                    (click)="markAllRead()"
                  >
                    {{ t("ui.shell.markAllRead") }}
                  </button>
                </header>
                <div
                  class="panel__tabs"
                  role="tablist"
                  [attr.aria-label]="t('ui.shell.notifTabsAria')"
                >
                  <button
                    type="button"
                    role="tab"
                    class="panel__tab"
                    [class.panel__tab--active]="bellTab() === 'all'"
                    [attr.aria-selected]="bellTab() === 'all'"
                    (click)="setBellTab('all')"
                  >
                    {{ t("ui.shell.notifTabAll") }}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    class="panel__tab"
                    [class.panel__tab--active]="bellTab() === 'unread'"
                    [attr.aria-selected]="bellTab() === 'unread'"
                    (click)="setBellTab('unread')"
                  >
                    {{ t("ui.shell.notifTabUnread") }}
                    @if (unreadCount() > 0) {
                      <span class="panel__tab-count">{{ badge() }}</span>
                    }
                  </button>
                </div>
                <div class="panel__body">
                  @if (notifications.loading()) {
                    <p class="panel__state">
                      {{ t("ui.shell.notificationsLoading") }}
                    </p>
                  } @else if (notifications.error()) {
                    <p class="panel__state panel__state--error">
                      {{ notifications.error() }}
                    </p>
                  } @else if (!panelItems().length) {
                    <p class="panel__state">
                      {{
                        bellTab() === "unread"
                          ? t("ui.shell.notificationsUnreadEmpty")
                          : t("ui.shell.notificationsEmpty")
                      }}
                    </p>
                  } @else {
                    <div class="panel__scroll-content">
                      @for (section of panelSections(); track section.key) {
                        <p class="panel__group">
                          {{ groupLabel(section.labelKey) }}
                        </p>
                        @for (item of section.items; track item.id) {
                          <button
                            type="button"
                            class="noti"
                            [class.noti--unread]="!item.readAt"
                            (click)="openNotification(item)"
                          >
                            <span
                              class="noti__ico"
                              [attr.data-tone]="tone(item.type)"
                              aria-hidden="true"
                            >
                              <mat-icon fontSet="material-icons-round">{{
                                icon(item.type)
                              }}</mat-icon>
                            </span>
                            <span class="noti__body">
                              <strong>{{ item.title }}</strong>
                              <span class="noti__content">{{
                                formatContent(item)
                              }}</span>
                              <time>{{
                                relativeTime(item.createdAt) ||
                                  (item.createdAt | date: "dd/MM/yyyy HH:mm")
                              }}</time>
                            </span>
                            @if (!item.readAt) {
                              <span
                                class="noti__unread-dot"
                                aria-hidden="true"
                              ></span>
                            }
                          </button>
                        }
                      }
                    </div>
                  }
                </div>
                <footer class="panel__foot">
                  <a routerLink="/notifications" (click)="closeMenus()">{{
                    t("ui.shell.viewAllNotifications")
                  }}</a>
                </footer>
              </div>
            }
          </div>

          <div class="dropdown">
            <button
              type="button"
              class="account"
              [attr.aria-expanded]="accountOpen()"
              (click)="toggleAccount()"
            >
              @if (avatarUrl()) {
                <img class="account__avatar account__avatar--img" [src]="avatarUrl()" [alt]="displayName()" />
              } @else {
                <span class="account__avatar">{{ initial() }}</span>
              }
              <span class="account__copy">
                <strong>{{ displayName() }}</strong>
                <em>{{ roleNames() || t("ui.shell.noRole") }}</em>
              </span>
              <mat-icon
                class="account__caret"
                [class.account__caret--open]="accountOpen()"
                fontSet="material-icons-round"
                >expand_more</mat-icon
              >
            </button>
            @if (accountOpen()) {
              <div class="panel panel--account">
                <div class="panel__account-head">
                  @if (avatarUrl()) {
                    <img class="panel__account-avatar panel__account-avatar--img" [src]="avatarUrl()" [alt]="displayName()" />
                  } @else {
                    <span class="panel__account-avatar">{{ initial() }}</span>
                  }
                  <span class="panel__account-info">
                    <strong>{{ displayName() }}</strong>
                    <em>{{ email() || t("ui.shell.noEmail") }}</em>
                  </span>
                </div>
                <a routerLink="/profile" (click)="closeMenus()"
                  ><mat-icon fontSet="material-icons-round">person</mat-icon
                  >{{ t("ui.shell.profile") }}</a
                >
                <a
                  routerLink="/profile"
                  [queryParams]="{ tab: 'password' }"
                  (click)="closeMenus()"
                  ><mat-icon fontSet="material-icons-round">lock_reset</mat-icon
                  >{{ t("ui.shell.changePassword") }}</a
                >
                <button
                  type="button"
                  class="panel__danger"
                  (click)="openLogoutModal()"
                >
                  <mat-icon fontSet="material-icons-round">logout</mat-icon
                  >{{ t("ui.shell.logout") }}
                </button>
              </div>
            }
          </div>
        </div>
      </header>

      <nav class="breadcrumb" [attr.aria-label]="t('ui.shell.breadcrumb')">
        <a [routerLink]="homeRoute()" [attr.aria-label]="t('ui.shell.home')"
          ><mat-icon fontSet="material-icons-round">home</mat-icon></a
        >
        @for (crumb of trail(); track crumb.key) {
          <span class="breadcrumb__sep">/</span>
          @if (crumb.route) {
            <a [routerLink]="crumb.route">{{ menuLabel(crumb) }}</a>
          } @else {
            <span>{{ menuLabel(crumb) }}</span>
          }
        }
      </nav>
      @if (showLogoutModal()) {
        <div
          class="logout-overlay"
          role="button"
          tabindex="0"
          (click)="onOverlayClick($event)"
          (keyup.escape)="cancelLogout()"
        >
          <div class="logout-modal" role="dialog" aria-modal="true">
            <!-- Icon tròn màu đỏ căn giữa -->
            <div class="logout-modal__icon">
              <mat-icon fontSet="material-icons-round">logout</mat-icon>
            </div>

            <!-- Tiêu đề & Nội dung mô tả -->
            <h3 class="logout-modal__title">{{ t("ui.shell.logoutTitle") }}</h3>
            <p class="logout-modal__desc">
              {{ t("ui.shell.logoutDesc") }}
            </p>

            <!-- Hàng nút bấm -->
            <div class="logout-modal__actions">
              <button type="button" class="btn-cancel" (click)="cancelLogout()">
                {{ t("ui.common.cancelAction") }}
              </button>
              <button
                type="button"
                class="btn-logout"
                (click)="confirmLogout()"
              >
                {{ t("ui.shell.logout") }}
              </button>
            </div>
          </div>
        </div>
      }

      <main class="content">
        <ng-content />
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        /* Tông cam của mục điều hướng đang chọn, bám mockup (--orange-500). Khoanh trong shell,
           KHÔNG đổi --sg-primary toàn cục. */
        --sg-nav-active: #e8622c;
        --sg-nav-active-strong: #ff7a45;
      }
      .shell {
        display: grid;
        grid-template-columns: var(--sg-sidebar-width) minmax(0, 1fr);
        grid-template-rows: var(--sg-topbar-height) var(
            --sg-breadcrumb-height
          ) minmax(0, 1fr);
        grid-template-areas: "sidebar topbar" "sidebar breadcrumb" "sidebar content";
        min-height: 100vh;
        background: var(--sg-bg-app);
      }
      .shell--collapsed {
        grid-template-columns: var(--sg-sidebar-width-collapsed) minmax(0, 1fr);
      }

      /* --- Sidebar --- */
      .sidebar {
        grid-area: sidebar;
        position: sticky;
        top: 0;
        align-self: start;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        height: 100vh;
        background: linear-gradient(
          180deg,
          var(--sg-primary-800),
          var(--sg-primary-900)
        );
        color: var(--sg-text-invert);
        overflow: hidden;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: var(--sg-topbar-height);
        padding: 0 var(--sg-space-3);
        color: inherit;
        text-decoration: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }
      .brand__emblem {
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
      }
      .brand__copy {
        display: grid;
        line-height: 1.15;
        min-width: 0;
      }
      .brand__copy strong {
        font-size: var(--sg-body-size);
        font-weight: 700;
        line-height: 1.2;
      }
      .brand__copy em {
        font-style: normal;
        font-size: var(--sg-small-size);
        font-weight: 400;
        color: #94a2c4;
        line-height: 1.2;
      }

      .nav {
        padding: var(--sg-space-2) var(--sg-space-2);
        overflow-y: auto;
      }
      .nav::-webkit-scrollbar {
        width: 6px;
      }
      .nav::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.24);
        border-radius: var(--sg-radius-pill);
      }
      .nav-empty {
        margin: var(--sg-space-3);
        color: rgba(255, 255, 255, 0.72);
        font-size: var(--sg-small-size);
      }

      .nav-link {
        width: 100%;
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        min-height: 42px;
        padding: 0 var(--sg-space-3);
        margin-bottom: 2px;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: rgba(255, 255, 255, 0.88);
        font-size: var(--sg-body-size);
        font-weight: 400;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--sg-text-invert);
      }
      .nav-link--active {
        background: var(--sg-nav-active);
        color: var(--sg-text-invert);
        font-weight: 700;
        box-shadow: inset 3px 0 0 var(--sg-nav-active-strong);
      }
      .nav-link--active:hover {
        background: var(--sg-nav-active);
        color: var(--sg-text-invert);
      }
      .nav-link mat-icon {
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      .nav-link__label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nav-link__caret {
        transition: transform 0.15s ease;
      }
      .nav-group--open .nav-link__caret {
        transform: rotate(180deg);
      }

      .nav-children {
        display: grid;
        padding: 2px 0 var(--sg-space-2) var(--sg-space-6);
      }
      .nav-child {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: 34px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius);
        color: rgba(255, 255, 255, 0.8);
        font-size: var(--sg-small-size);
        text-decoration: none;
      }
      .nav-child:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--sg-text-invert);
      }
      .nav-child--active {
        color: var(--sg-nav-active-strong);
        font-weight: 700;
      }
      .nav-child__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.7;
      }

      .collapse-btn {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: 44px;
        padding: 0 var(--sg-space-4);
        border: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.88);
        font-size: var(--sg-small-size);
        font-weight: 700;
        cursor: pointer;
      }
      .collapse-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .shell--collapsed .brand__copy,
      .shell--collapsed .nav-link__label,
      .shell--collapsed .nav-link__caret,
      .shell--collapsed .nav-children,
      .shell--collapsed .nav-empty {
        display: none;
      }
      .shell--collapsed .nav-link,
      .shell--collapsed .collapse-btn {
        justify-content: center;
        padding: 0;
      }
      .shell--collapsed .brand {
        justify-content: center;
        padding: 0;
      }

      /* --- Topbar --- */
      .topbar {
        grid-area: topbar;
        position: sticky;
        top: 0;
        z-index: 12;
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: 0 var(--sg-space-4);
        background: var(--sg-bg-surface);
        border-bottom: 1px solid var(--sg-border);
      }
      .topbar__search {
        flex: 1 1 auto;
        max-width: 520px;
      }
      .topbar__actions {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        margin-left: auto;
      }
      .icon-action {
        position: relative;
        display: inline-grid;
        place-items: center;
        width: 38px;
        min-width: 38px;
        height: 38px;
        min-height: 38px;
        padding: 0;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        text-decoration: none;
        cursor: pointer;
      }
      .icon-action:hover {
        background: var(--sg-bg-subtle);
        color: var(--sg-text);
      }
      .badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        display: grid;
        place-items: center;
        border-radius: var(--sg-radius-pill);
        background: var(--sg-danger);
        color: var(--sg-text-invert);
        font-size: var(--sg-caption-size);
        font-weight: 700;
      }
      .account {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: 42px;
        padding: 0 var(--sg-space-2);
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text);
        cursor: pointer;
      }
      .account:hover {
        background: var(--sg-bg-subtle);
      }
      .account__avatar {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--sg-primary-600);
        color: var(--sg-text-invert);
        font-weight: 700;
      }
      .account__avatar--img {
        object-fit: cover;
      }
      .account__caret {
        transition: transform 0.15s ease;
      }
      .account__caret--open {
        transform: rotate(180deg);
      }
      .account__copy {
        display: grid;
        text-align: left;
        line-height: 1.2;
      }
      .account__copy strong {
        font-size: var(--sg-small-size);
      }
      .account__copy em {
        font-style: normal;
        font-size: var(--sg-caption-size);
        color: var(--sg-text-muted);
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .locale-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 38px;
        padding: 0 var(--sg-space-2);
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
        font-weight: 700;
        cursor: pointer;
      }
      .locale-btn:hover {
        background: var(--sg-bg-subtle);
        color: var(--sg-text);
      }
      .locale-btn mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      .panel--locale {
        width: 200px;
        display: grid;
        padding: var(--sg-space-1);
      }
      .panel--locale button {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: 38px;
        padding: 0 var(--sg-space-3);
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text);
        font-size: var(--sg-body-size);
        text-align: left;
        cursor: pointer;
      }
      .panel--locale button:hover {
        background: var(--sg-bg-subtle);
      }
      .panel--locale__active {
        font-weight: 700;
        color: var(--sg-primary) !important;
      }
      .locale-code {
        display: inline-grid;
        place-items: center;
        min-width: 28px;
        height: 20px;
        border-radius: var(--sg-radius);
        background: var(--sg-bg-subtle);
        font-size: var(--sg-caption-size);
        font-weight: 700;
      }

      .dropdown {
        position: relative;
      }
      .panel {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        z-index: 20;
        background: var(--sg-bg-surface);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius-card);
        box-shadow: var(--sg-shadow-modal);
        overflow: hidden;
      }
      .panel--notifications {
        width: 480px;
        max-width: calc(100vw - 32px);
      }
      .panel--help {
        width: 280px;
        display: grid;
        gap: var(--sg-space-2);
        padding: var(--sg-space-4);
      }
      .panel--help span {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .panel--help mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
        color: var(--sg-primary-600);
      }
      .panel--account {
        width: 240px;
        display: grid;
        padding: var(--sg-space-1);
      }
      .panel__account-head {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-3);
        margin-bottom: var(--sg-space-1);
        border-bottom: 1px solid var(--sg-border);
      }
      .panel__account-avatar {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--sg-primary-600);
        color: var(--sg-text-invert);
        font-weight: 700;
      }
      .panel__account-avatar--img {
        object-fit: cover;
      }
      .panel__account-info {
        display: grid;
        min-width: 0;
        line-height: 1.3;
      }
      .panel__account-info strong {
        font-size: var(--sg-small-size);
        color: var(--sg-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .panel__account-info em {
        font-style: normal;
        font-size: var(--sg-caption-size);
        color: var(--sg-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .panel--account a,
      .panel--account button {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: 38px;
        padding: 0 var(--sg-space-3);
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text);
        font-size: var(--sg-body-size);
        font-weight: 400;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }
      .panel--account a:hover,
      .panel--account button:hover {
        background: var(--sg-bg-subtle);
      }
      .panel--account mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--sg-text-muted);
      }
      .panel__danger {
        color: var(--sg-danger) !important;
      }
      .panel__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-2);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }
      .link-btn {
        border: 0;
        background: transparent;
        color: var(--sg-primary);
        font-size: var(--sg-small-size);
        font-weight: 700;
        min-height: 24px;
        padding: 0;
        cursor: pointer;
      }
      .link-btn:disabled {
        color: var(--sg-text-muted);
        cursor: not-allowed;
      }
      .panel__body {
        max-height: 380px;
        overflow-y: auto;
        overflow-x: auto;
      }
      .panel__scroll-content {
        display: flex;
        flex-direction: column;
        min-width: 100%;
        width: max-content;
      }
      .panel__state {
        margin: 0;
        padding: var(--sg-space-5);
        text-align: center;
        color: var(--sg-text-muted);
      }
      .panel__state--error {
        color: var(--sg-danger);
      }
      .panel__foot {
        padding: var(--sg-space-2);
        border-top: 1px solid var(--sg-border);
        text-align: center;
      }
      .panel__foot a {
        color: var(--sg-primary);
        font-size: var(--sg-small-size);
        font-weight: 700;
        text-decoration: none;
      }

      .noti {
        width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border: 0;
        border-bottom: 1px solid var(--sg-bg-subtle);
        border-radius: 0;
        background: transparent;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .noti:hover {
        background: var(--sg-bg-subtle);
      }
      .noti--unread {
        background: var(--sg-primary-soft);
      }
      .noti__ico {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
        border-radius: var(--sg-radius);
        background: var(--sg-info-soft);
        color: var(--sg-info);
      }
      .noti__ico mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      .noti__ico[data-tone="warn"] {
        background: var(--sg-state-waiting-soft);
        color: var(--sg-state-waiting-ink);
      }
      .noti__ico[data-tone="danger"] {
        background: var(--sg-state-rejected-soft);
        color: var(--sg-state-rejected);
      }
      .noti__ico[data-tone="success"] {
        background: var(--sg-state-done-soft);
        color: var(--sg-state-done);
      }
      .noti__ico[data-tone="system"] {
        background: var(--sg-bg-muted);
        color: var(--sg-text-muted);
      }
      .noti__unread-dot {
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        margin-top: 6px;
        border-radius: 50%;
        background: var(--sg-primary-600);
      }
      .noti__body {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1 1 auto;
        white-space: nowrap;
      }
      .panel__tabs {
        display: flex;
        gap: var(--sg-space-1);
        padding: var(--sg-space-2) var(--sg-space-3) 0;
      }
      .panel__tab {
        display: inline-flex;
        align-items: center;
        gap: var(--sg-space-1);
        min-height: 34px;
        padding: 0 var(--sg-space-2);
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        background: transparent;
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
        font-weight: 700;
        cursor: pointer;
      }
      .panel__tab--active {
        color: var(--sg-primary);
        border-bottom-color: var(--sg-primary);
      }
      .panel__tab-count {
        display: inline-grid;
        place-items: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: var(--sg-radius-pill);
        background: var(--sg-primary-soft);
        color: var(--sg-primary);
        font-size: var(--sg-caption-size);
      }
      .panel__group {
        margin: 0;
        padding: var(--sg-space-2) var(--sg-space-4) var(--sg-space-1);
        font-size: var(--sg-caption-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--sg-text-muted);
        width: 100%;
        box-sizing: border-box;
      }
      .noti__body strong {
        font-size: var(--sg-body-size);
        font-weight: 600;
        line-height: 1.35;
        color: var(--sg-text);
        white-space: nowrap;
      }
      .noti__content {
        font-size: var(--sg-small-size);
        font-weight: 400;
        line-height: 1.4;
        color: var(--sg-text-muted);
        white-space: nowrap;
      }
      .noti__body time {
        font-size: var(--sg-caption-size);
        color: var(--sg-text-muted);
        margin-top: 2px;
      }

      /* --- Breadcrumb --- */
      .breadcrumb {
        grid-area: breadcrumb;
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: var(--sg-breadcrumb-height);
        padding: 0 var(--sg-space-5);
        background: var(--sg-bg-surface);
        border-bottom: 1px solid var(--sg-border);
        font-size: var(--sg-small-size);
        color: var(--sg-text-muted);
      }
      .breadcrumb a {
        display: inline-flex;
        align-items: center;
        color: var(--sg-text-muted);
        text-decoration: none;
      }
      .breadcrumb a:hover {
        color: var(--sg-primary);
      }
      .breadcrumb mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .breadcrumb__sep {
        color: var(--sg-border-strong);
      }

      .content {
        grid-area: content;
        padding: var(--sg-space-4) var(--sg-space-5);
        min-width: 0;
      }

      @media (max-width: 1100px) {
        .shell {
          grid-template-columns: var(--sg-sidebar-width-collapsed) minmax(
              0,
              1fr
            );
        }
        /* Tự động thu gọn menu về icon-only khi màn hình hẹp — cùng cách hiển thị với .shell--collapsed
           (bấm nút thu gọn). Trước đây media query chỉ thu hẹp cột nhưng vẫn hiện nhãn nên menu bị bóp méo. */
        .brand__copy,
        .nav-link__label,
        .nav-link__caret,
        .nav-children,
        .nav-empty {
          display: none;
        }
        .nav-link,
        .collapse-btn,
        .brand {
          justify-content: center;
          padding: 0;
        }
        .topbar__search {
          max-width: none;
        }
        .account__copy {
          display: none;
        }
      }

      .logout-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(3px);
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 16px;
      }
      .logout-modal {
        background: #ffffff;
        width: 100%;
        max-width: 420px;
        border-radius: 16px;
        padding: 28px 24px 24px;
        text-align: center;
        box-shadow:
          0 20px 25px -5px rgba(0, 0, 0, 0.15),
          0 10px 10px -5px rgba(0, 0, 0, 0.04);
        animation: modalScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes modalScaleIn {
        from {
          opacity: 0;
          transform: scale(0.92);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .logout-modal__icon {
        display: inline-grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #fde8e8;
        color: #e53935;
        margin-bottom: 16px;
      }
      .logout-modal__icon mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .logout-modal__title {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 700;
        color: #111827;
      }

      .logout-modal__desc {
        margin: 0 0 24px 0;
        font-size: 14px;
        line-height: 1.5;
        color: #6b7280;
      }

      .logout-modal__actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .btn-cancel,
      .btn-logout {
        height: 42px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .btn-cancel {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        color: #374151;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      .btn-cancel:hover {
        background: #f9fafb;
        border-color: #d1d5db;
      }

      .btn-logout {
        background: #d9383a;
        border: 0;
        color: #ffffff;
        box-shadow: 0 1px 2px rgba(217, 56, 58, 0.2);
      }
      .btn-logout:hover {
        background: #c02b2d;
      }
    `,
  ],
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationStore);
  protected readonly i18n = inject(I18nService);
  /** Gán thẳng hàm dịch để template dùng `{{ t('ui.…') }}`; hàm đọc signal ngôn ngữ nên đổi ngôn
   * ngữ là template tự vẽ lại, không phải tải lại trang. */
  protected readonly t = this.i18n.t;

  protected menuLabel(item: { key?: string; route?: string; label: string } | null | undefined): string {
    if (!item) return '';
    if (this.i18n.locale() === 'vi') return item.label;

    const key = (item.key || '').toLowerCase();
    const route = (item.route || '').toLowerCase();

    if (key.includes('dashboard') || key.includes('overview') || route.includes('dashboard')) return this.t('ui.menu.dashboard');
    if (key.includes('declaration') || key.includes('dossier') || route.includes('declarations')) return this.t('ui.menu.declarations');
    if (key.includes('workflow') || key.includes('inter-agency') || route.includes('workflow') || route.includes('inter-agency')) return this.t('ui.menu.interAgency');
    if (key.includes('dispatch') || route.includes('dispatch') || route.includes('vehicle-confirmation')) return this.t('ui.menu.dispatch');
    if (key.includes('gate') || route.includes('gate')) return this.t('ui.menu.gate');

    if (key.includes('yard-map') || route.includes('customs-b5')) return this.t('ui.menu.yardMap');
    if (key.includes('yard-config') || route.includes('yard/config')) return this.t('ui.menu.yardConfig');
    if (key.includes('yard') || route.includes('yard')) return this.t('ui.menu.yard');

    if (key.includes('fee-collect') || route.includes('fees/tax')) return this.t('ui.menu.feeCollect');
    if (key.includes('fee-rules') || route.includes('fees/rules')) return this.t('ui.menu.feeRules');
    if (key.includes('fee') || route.includes('fee')) return this.t('ui.menu.fee');

    if (key.includes('report') || route.includes('report')) return this.t('ui.menu.reports');
    if (key.includes('catalog') || route.includes('catalog')) return this.t('ui.menu.catalogs');

    if (key.includes('user') || route.includes('users')) return this.t('ui.menu.users');
    if (key.includes('role') || route.includes('roles')) return this.t('ui.menu.roles');
    if (key.includes('audit') || route.includes('audit')) return this.t('ui.menu.auditLog');
    if (key.includes('config') || key.includes('setting') || route.includes('system-config') || route.includes('settings')) return this.t('ui.menu.settings');
    if (key.includes('system') || route.includes('admin')) return this.t('ui.menu.system');

    return item.label;
  }

  protected readonly menu = this.auth.menu;
  protected readonly roleNames = computed(() => {
    const roles = this.auth.roles();
    if (!roles.length) return '';
    return roles.map((r) => actorRoleLabel(r.code, this.t) || r.name).join(' · ');
  });
  protected readonly unreadCount = this.notifications.unreadCount;
  protected readonly badge = this.notifications.badge;

  /** Sắc thái/biểu tượng theo mã loại thông báo — dùng cho ô biểu tượng màu trong panel chuông. */
  protected readonly tone = notifTone;
  protected readonly icon = notifIcon;

  protected readonly collapsed = signal(false);
  protected readonly bellOpen = signal(false);
  /** Tab trong panel chuông (Tất cả / Chưa đọc) — lọc client theo `readAt`. */
  protected readonly bellTab = signal<"all" | "unread">("all");
  protected readonly accountOpen = signal(false);
  protected readonly helpOpen = signal(false);
  protected readonly localeOpen = signal(false);
  protected keyword = "";

  private readonly url = signal(this.router.url);
  private readonly manualToggles = signal<Record<string, boolean>>({});
  private subscription?: Subscription;

  protected readonly displayName = computed(
    () =>
      this.auth.currentUser()?.displayName || this.t("ui.shell.userFallback"),
  );
  /** Email người đăng nhập cho đầu hộp xổ tài khoản (BUG-091). */
  protected readonly email = computed(
    () => this.auth.currentUser()?.email ?? "",
  );
  protected readonly initial = computed(() =>
    (this.auth.currentUser()?.displayName || "U").charAt(0).toUpperCase(),
  );
  protected readonly avatarUrl = this.auth.avatarUrl;
  protected readonly trail = computed(() => menuTrail(this.menu(), this.url()));

  protected readonly showLogoutModal = signal(false);
  protected readonly message = signal("");
  protected readonly messageType = signal<"success" | "error" | "info">(
    "success",
  );

  /** Danh sách thông báo trong panel sau khi lọc theo tab đang chọn (client, dựa `readAt`). */
  protected readonly panelItems = computed(() => {
    const items = this.notifications.recent();
    return this.bellTab() === "unread"
      ? items.filter((item) => !item.readAt)
      : items;
  });
  /** Panel gom theo mốc thời gian: Hôm nay / Hôm qua / Trước đó. */
  protected readonly panelSections = computed(() =>
    groupByTime(this.panelItems()),
  );

  ngOnInit(): void {
    this.notifications.startPolling();
    this.subscription = this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe((event) => {
        this.url.set(event.urlAfterRedirects);
        this.closeMenus();
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.notifications.stopPolling();
  }

  protected homeRoute(): string {
    return this.auth.defaultRoute();
  }

  protected isActive(item: MenuItem): boolean {
    const currentTrail = this.trail();
    if (currentTrail.length > 0) {
      const activeLeaf = currentTrail[currentTrail.length - 1];
      return activeLeaf.key === item.key;
    }
    if (!item.route) return false;
    const path = this.url().split("?")[0].split("#")[0];
    return path === item.route || path.startsWith(`${item.route}/`);
  }

  /** Nhóm cha đang chứa route hiện tại. */
  protected isTrail(item: MenuItem): boolean {
    return this.trail().some((crumb) => crumb.key === item.key);
  }

  /** Tự bung khi đang ở route con, trừ khi người dùng đã bấm đóng/mở thủ công. */
  protected isOpen(item: MenuItem): boolean {
    return this.manualToggles()[item.key] ?? this.isTrail(item);
  }

  protected toggle(item: MenuItem): void {
    const next = !this.isOpen(item);
    this.manualToggles.update((state) => ({ ...state, [item.key]: next }));
  }

  protected toggleCollapse(): void {
    this.collapsed.update((value) => !value);
  }

  protected toggleBell(): void {
    const next = !this.bellOpen();
    this.closeMenus();
    this.bellOpen.set(next);
    if (next) this.notifications.loadRecent();
  }

  protected setBellTab(tab: "all" | "unread"): void {
    this.bellTab.set(tab);
  }

  /** Nhãn nhóm thời gian — mã nhóm là ASCII, nhãn tra qua i18n. */
  protected groupLabel(labelKey: string): string {
    return this.t(labelKey as MessageKey);
  }

  /**
   * Thời gian tương đối của thông báo ("x phút trước"…) cho panel chuông (BUG-087).
   * Trả rỗng khi quá 7 ngày để template rơi về ngày giờ tuyệt đối.
   */
  protected relativeTime(createdAt: string): string {
    const rel = notifRelativeTime(createdAt);
    return rel ? this.t(rel.key as MessageKey, rel.params) : "";
  }

  protected toggleAccount(): void {
    const next = !this.accountOpen();
    this.closeMenus();
    this.accountOpen.set(next);
  }

  protected toggleHelp(): void {
    const next = !this.helpOpen();
    this.closeMenus();
    this.helpOpen.set(next);
  }

  protected toggleLocale(): void {
    const next = !this.localeOpen();
    this.closeMenus();
    this.localeOpen.set(next);
  }

  /** Đổi ngôn ngữ: lựa chọn được nhớ lại, giao diện vẽ lại ngay nhờ signal — không tải lại trang. */
  protected chooseLocale(code: string): void {
    this.i18n.setLocale(code);
    this.closeMenus();
  }

  protected closeMenus(): void {
    this.bellOpen.set(false);
    this.accountOpen.set(false);
    this.helpOpen.set(false);
    this.localeOpen.set(false);
  }

  /** Có hộp xổ nào trên topbar đang mở không (chuông / tài khoản / trợ giúp / ngôn ngữ). */
  private anyMenuOpen(): boolean {
    return (
      this.bellOpen() ||
      this.accountOpen() ||
      this.helpOpen() ||
      this.localeOpen()
    );
  }

  /**
   * Đóng mọi hộp xổ khi bấm ra ngoài (BUG-053/BUG-056). Bấm bên trong một `.dropdown`
   * (nút mở hoặc thân panel) thì bỏ qua — nút mở tự lo đóng/mở, còn thao tác trong panel
   * (đổi tab, đánh dấu đã đọc…) không được làm đóng panel.
   */
  @HostListener("document:click", ["$event"])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.anyMenuOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".dropdown")) return;
    this.closeMenus();
  }

  protected markAllRead(): void {
    this.notifications.markAllRead();
  }

  protected formatContent(item: { content: string; createdAt?: string }): string {
    return formatNotificationContent(item.content, item.createdAt);
  }

  protected openNotification(item: NotificationItem): void {
    this.notifications.markRead(item.id);
    this.closeMenus();
    const route = notifRoute(item);
    if (route) void this.router.navigateByUrl(route);
  }

  protected quickSearch(): void {
    const keyword = this.keyword.trim();
    if (!keyword) return;
    void this.router.navigate(["/declarations"], { queryParams: { keyword } });
  }

  protected logout(): void {
    this.closeMenus();
    this.notifications.reset();
    this.auth.logout();
  }


  protected openLogoutModal(): void {
    this.closeMenus();
    this.showLogoutModal.set(true); 
  }

  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelLogout();
    }
  }

  protected cancelLogout(): void {
    this.showLogoutModal.set(false);
  }


  protected confirmLogout(): void {
    this.showLogoutModal.set(false);
    this.notifications.reset();
    this.auth.logout();
  }

  /** Ctrl + K đưa con trỏ vào ô tìm kiếm nhanh. */
  @HostListener("document:keydown", ["$event"])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>(
        ".topbar__search input",
      );
      input?.focus();
      return;
    }
    if (event.key === "Escape") this.closeMenus();
  }
}
