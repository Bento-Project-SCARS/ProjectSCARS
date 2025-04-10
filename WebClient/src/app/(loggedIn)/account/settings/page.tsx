"use client";

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { User } from "@/lib/models";
import { useRouter } from "next/navigation";
import { getUserProfile } from "@/lib/user_handler";

export default function AccountSettings() {
  const { is_authenticated, logout } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  // Simulated user data (replace)
  const [user, setUser] = useState<User | null>(null);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    setIsEditing(false);
  };

  const handleChange = (e) => {
    // TODO: WIP
    // const { id, value } = e.target;
    // setUser((prevUser) => ({ ...prevUser, [id]: value }));
  };

  const handleProfilePicChange = (e: {
    target: { files: (Blob | MediaSource)[] };
  }) => {
    if (e.target.files && e.target.files[0]) {
      // TODO: WIP
      // Temporarily display uploaded image
      // profilePic: URL.createObjectURL(e.target.files[0])
    }
  };

  useEffect(() => {
    const kickUserOut = () => {
      logout();
      router.push("/login");
    };

    if (!is_authenticated) {
      kickUserOut();
    }

    const fetchUserProfile = async () => {
      try {
        const user_data = await getUserProfile();
        if (typeof user_data === "string") {
          // If it fails, show an error and the user log out
          toast.error(user_data);
          kickUserOut();
        } else {
          setUser(user_data);
        }
      } catch {
        toast.error("Failed to fetch user profile");
        kickUserOut();
      }
    };

    fetchUserProfile();
  }, [is_authenticated, logout, router, setUser]);

  return (
    <div>
      <div className="content-center">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      <div className="flex justify-between items-center mt-4">
        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>
                  Manage your account details below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center space-x-4">
                  <div className="relative group">
                    <Avatar className="h-24 w-24">
                      <AvatarImage
                        src={user?.avatarUrl || "/path/to/default/pic.jpg"} // TODO: WIP
                        alt="Profile picture"
                      />
                      <AvatarFallback>
                        {user?.nameFirst?.[0] ?? "?"}
                        {user?.nameLast?.[0] ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <label
                        htmlFor="upload"
                        className="absolute bottom-2 right-2 bg-white p-2 rounded-full shadow-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        <Pencil className="w-5 h-5 text-gray-700" />
                      </label>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      id="upload"
                      onChange={handleProfilePicChange}
                    />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {`${user?.nameFirst} ${user?.nameMiddle} ${user?.nameLast}`}
                    </p>
                    <p className="text-sm text-gray-500">{user?.roleId}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={`${user?.nameFirst} ${user?.nameMiddle} ${user?.nameLast}`}
                    disabled={!isEditing}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={user?.username}
                    disabled={!isEditing}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    id="email"
                    value={user?.email}
                    disabled={!isEditing}
                    onChange={handleChange}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                {!isEditing ? (
                  <Button onClick={handleEditClick}>Edit Profile</Button>
                ) : (
                  <Button onClick={handleSaveClick}>Save Changes</Button>
                )}
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>Change your password here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="current">Current password</Label>
                  <Input id="current" type="password" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new">New password</Label>
                  <Input id="new" type="password" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input id="confirm" type="password" />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button>Save password</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
