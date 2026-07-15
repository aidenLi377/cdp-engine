"""Small local administration CLI for CDP user accounts."""

from __future__ import annotations

import argparse
import getpass
import json
import sys

from cdp_backend.user_store import UserAlreadyExistsError, UserNotFoundError, UserStore


def _password(prompt: str) -> str:
    first = getpass.getpass(prompt)
    second = getpass.getpass("再次输入密码: ")
    if first != second:
        raise ValueError("两次输入的密码不一致")
    return first


def main() -> int:
    parser = argparse.ArgumentParser(description="CDP 用户管理")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create-user", help="创建登录账号")
    create.add_argument("username")
    create.add_argument("--display-name", default="")

    reset = subparsers.add_parser("reset-password", help="重置账号密码")
    reset.add_argument("username")

    subparsers.add_parser("list-users", help="列出已有账号")

    args = parser.parse_args()
    store = UserStore()
    try:
        if args.command == "create-user":
            user = store.create_user(args.username, _password("输入密码: "), args.display_name)
            print(f"已创建用户: {user['username']} ({user['displayName']})")
        elif args.command == "reset-password":
            store.reset_password(args.username, _password("输入新密码: "))
            print(f"已重置密码: {args.username}")
        else:
            print(json.dumps(store.list_users(), ensure_ascii=False, indent=2))
    except (ValueError, UserAlreadyExistsError, UserNotFoundError) as exc:
        print(f"操作失败: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
