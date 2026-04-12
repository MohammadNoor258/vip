#test
import random
import time
# name=input("enter your name:")
# age=int(input("enter youer age:"))
# ss=float(input("enter youer gpa:"))
# ff=bool(1==2)
# su=5%(1+2*3/4-6)
# print(type(name),'\"',name.upper(),'\"',"\n",name.lower(),"\n",name.title(),"\n",name.capitalize(),"\n",int(age),'\n',ss,'\n',ff,"\n",su)
# #------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# for i in range(1,6):
#     print("*"*i)
# for x in range(6,1,-1):
#     print("*"*x)
# #------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# first_number=float(input("enter first number:"))
# oper=input("chose an operation (+,-,*,/,%): ")
# second_number=float(input("enter second number:"))
# if oper=="+":
#     add=first_number+second_number
#     print("\n Adding: ",add)
# elif oper=="-":
#     sub=first_number-second_number
#     print("\n subtrract: ",sub)
# elif oper=="*":
#     mul=first_number*second_number
#     print("\n multiply: ",mul)
# elif oper=="/":
#     if second_number !=0:
#         div=first_number/second_number
#         print("\n divide:",div)
#     else:
#         print("cant division by zero")
# elif oper=="%":
#     mod=first_number%second_number
#     print("\n modulus: ",mod)
# #------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# print(not(10>2))
# if name == "emad":
#     print("you must chang your name")
# elif name=="mohammad":
#     print("nice")
# else:
#     print("you good")
# #------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# orders=[]
# while True:
#     drink =input("what would like to drink ? (coffee/tea): ")
#     number_of_drinks=input("how much "+drink+" do you want? ")
#     if drink == "coffee":
#         coffee = input("Do you want it with sugar or without? ")
#         orders.append((drink, number_of_drinks, coffee))
#     elif drink == "tea":
#         tea = input("Do you want green tea or red one? ")
#         orders.append((drink, number_of_drinks, tea))
#     else:
#         print("we dont have")

#     more = input("Do you want to add another order? (yes/no): ")
#     if more.lower() != "yes":
#         break
# print("\nYour order is:")
# for order in orders:
#     drink, number, option = order
#     print(f"- {number} {drink} ({option})")
# #------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# user_name=input("enter your user: ")
# password=input("enter your password: ")
# if user_name=="mohammad" and password=="123":
#     print("login successful")
# elif user_name!="mohammad"or password!="123":
#     print("your password or user name is wrong")
# else:
#     print("wrong user name and password")
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# students=[]
# marks=[]
# while True:
#     name_student=input("enter studen name:")
#     student_mark=input("enter his mark: ")
#     students.append(name_student)
#     marks.append(student_mark)
#     more1=input("Do you want to add another order? (yes/no): ")
#     if more1.lower()!="yes":
#         break
# print("\n your student list :")
# print("Name\t\tMark")
# print("-" * 20)    
# for i in range(len(students)):
#     print(f"{students[i]:<10}\t{marks[i]}")
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# rows =int(input("enter rows: "))
# for i in range(1,rows+1):
#     print(" " * (rows-i)+"*"*(2*i-1))
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# def hello(name,age):
#     print("welcome"+name,age)
# def add(x,y,c):
#     z=(x+y+c)/3
#     print(z)
# hello(" mohammad",23)
# add(5,5,6)
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# def sum():
#     year=int(input("enter your age : "))
#     s=year*365
#     h="you have lived "+str(s)+" days"
#     return h
# print(sum())
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# def guess():
#     i=0
#     print("welcome to number guess game! \n")
#     j=random.randint(1, 10)
#     while True:
#         g=int(input("guess a number between 1 to 10: "))
#         if g==j:
#             print("correct! you guessed the right number :"+str(j)+" in "+str(i)+" tries")
#             break
#         elif g>j:
#             print("too big! try again!")
#         elif g<j:
#             print("too low! try again!")  
#         i=i+1
# guess()
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# def tim():
#     mi=int(input("enter time in minutes: "))
#     se=mi*60
#     #clock:f"{mi:02d}:{se:02d}"
#     while se>=0:
#         mi=se//60
#         sec=se%60
#         clock=f"{mi:02d}:{sec:02d}"
#         print(f"\r{clock}",end="")
#         time.sleep(1)
#         se-=1
#         if se==0:
#             print("\ntimes up! tack a break!")
#             break
# tim()
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")
# def task():
#     tasks=[]
#     while True:
#         print("---------------------------")
#         print("choise an option : ")
#         print("1: add task : ")
#         print("2: view tasks : ")
#         print("3: delete task : ")
#         print("4: exit : ")
#         print("---------------------------")
#         choice=input("enter your choice (1-4):  ")
#         if choice=='1':
#             val=input("enter task: ")
#             tasks.append(val)
#             print("done add")
#         elif choice =="2":
#             if not tasks:
#                 print("no task here")
#             else:
#                 i=1
#                 for data in tasks:
#                     print(i,data)
#                     i+=1
#         elif choice =="3":
#             if not tasks:
#                 print("no task here")
#             else:
#                 i=1
#                 for data in tasks:
#                     print(i,data)
#                     i+=1
#                 tasknum=int(input("enter task number to del: "))
#                 if tasknum>=1 and tasknum<=len(tasks):
#                     de= tasks.pop(tasknum-1)                
#                     print(f"this task {de} deleted")
#                 else:
#                     print("out of rang")
#         elif choice =="4":
#             print("see you later")
#             break
# task()
#------------------------------------------------------------------------
# print("------------------------------------------------------------------------")




































